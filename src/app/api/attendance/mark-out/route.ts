import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth/session';
import { format, parseISO, addHours, isValid } from 'date-fns';
import { ObjectId } from 'mongodb';
import { invalidateBootstrapCache, updateCachedCollection } from '@/lib/data-cache';
import { parseDateTime } from '@/lib/utils';
import { realtimeBroadcaster } from '@/lib/realtime-events';

export const dynamic = 'force-dynamic';

const getISTTime = () => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

export async function POST(req: Request) {
  try {
    const sessionUser = getSessionUser(req);
    const body = await req.json().catch(() => ({}));

    // Resolve user session from request or body if provided
    const userRole = String(sessionUser?.role || body?.userRole || body?.role || '').trim().toUpperCase();

    // 1. Mandatory Role-Based Security: Only EMPLOYEE can Mark OUT
    if (!userRole || userRole !== 'EMPLOYEE') {
      return NextResponse.json(
        {
          success: false,
          message: "Only employees are allowed to Mark IN and Mark OUT."
        },
        { status: 403 }
      );
    }

    const db = await getDb();
    const employeesCol = db.collection('employees');
    const attendanceCol = db.collection('attendance');

    // 2. Identify and verify authenticated Employee
    const sessionEmpId = String(sessionUser?.employeeId || sessionUser?.username || sessionUser?.id || body?.employeeId || '').trim();
    if (!sessionEmpId) {
      return NextResponse.json(
        { success: false, message: "Missing employee identification." },
        { status: 400 }
      );
    }

    const cleanSessionEmpId = sessionEmpId.replace(/\s/g, '').toUpperCase();

    // Fast indexed direct employee lookup (sub-millisecond)
    let matchedEmp = await employeesCol.findOne({
      $or: [
        { employeeId: cleanSessionEmpId },
        { employeeId: sessionEmpId },
        { id: cleanSessionEmpId },
        { id: sessionEmpId },
        { username: cleanSessionEmpId },
        { username: sessionEmpId },
        { aadhaarNumber: cleanSessionEmpId },
        { aadhaar: cleanSessionEmpId },
        { mobileNumber: cleanSessionEmpId },
        { mobile: cleanSessionEmpId },
      ]
    });

    // Fallback if not matched on exact match
    if (!matchedEmp) {
      const allEmployees = await employeesCol.find({}).limit(200).toArray();
      matchedEmp = allEmployees.find((e: any) => {
        const empId = String(e.employeeId || '').replace(/\s/g, '').toUpperCase();
        const id = String(e.id || e._id || '').replace(/\s/g, '').toUpperCase();
        const aadhaar = String(e.aadhaarNumber || e.aadhaar || '').replace(/\s/g, '').toUpperCase();
        const mobile = String(e.mobileNumber || e.mobile || '').replace(/\s/g, '').toUpperCase();
        const username = String(e.username || '').replace(/\s/g, '').toUpperCase();

        return (
          empId === cleanSessionEmpId ||
          id === cleanSessionEmpId ||
          aadhaar === cleanSessionEmpId ||
          mobile === cleanSessionEmpId ||
          username === cleanSessionEmpId
        );
      }) || null;
    }

    if (!matchedEmp) {
      return NextResponse.json(
        { success: false, message: "Employee record not found in system." },
        { status: 404 }
      );
    }

    // 3. Employee Security: Prevent Employee A from punching for Employee B
    const requestEmpId = body?.employeeId ? String(body.employeeId).replace(/\s/g, '').toUpperCase() : null;
    const internalEmpId = String(matchedEmp.employeeId || matchedEmp.id || matchedEmp._id);
    const internalEmpIdClean = internalEmpId.replace(/\s/g, '').toUpperCase();

    if (requestEmpId && requestEmpId !== internalEmpIdClean && requestEmpId !== cleanSessionEmpId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: You can only mark attendance for your own account." },
        { status: 403 }
      );
    }

    // 4. Find active Open attendance record for this employee
    const recordId = body?.id || body?._id || body?.recordId;
    let activeRecord: any = null;

    if (recordId) {
      let query: any = { _id: recordId };
      if (ObjectId.isValid(recordId)) {
        query = { $or: [{ _id: new ObjectId(recordId) }, { id: recordId }, { _id: recordId }] };
      }
      activeRecord = await attendanceCol.findOne({
        ...query,
        employeeId: { $in: [internalEmpId, matchedEmp.employeeId, matchedEmp.id].filter(Boolean) }
      });
    }

    if (!activeRecord) {
      activeRecord = await attendanceCol.findOne({
        employeeId: { $in: [internalEmpId, matchedEmp.employeeId, matchedEmp.id].filter(Boolean) },
        status: 'Open'
      });
    }

    if (!activeRecord || !activeRecord.inTime) {
      return NextResponse.json(
        { success: false, message: "Cannot Mark OUT because no valid Mark IN record exists." },
        { status: 400 }
      );
    }

    // 5. Block manual Mark OUT if attendance was already auto-closed
    if (activeRecord.autoOut === true || activeRecord.status === 'Auto OUT') {
      return NextResponse.json(
        { success: false, message: "This attendance record has already been automatically closed. Manual Mark OUT is not allowed." },
        { status: 400 }
      );
    }

    const now = getISTTime();
    const outTimeStr = format(now, "HH:mm");
    const outDateStr = format(now, "yyyy-MM-dd");
    let outDT = parseDateTime(outDateStr, outTimeStr) || now;

    // ── Working-Hour Calculation (Manual OUT) ──────────────────────────────
    // Rule: Manual OUT = actual OUT timestamp − actual IN timestamp.
    const inDateStr = activeRecord.inDate || activeRecord.date || outDateStr;
    const inTimeStr = activeRecord.inTime;
    let inDT: Date | null = null;
    if (inDateStr && inTimeStr) {
      inDT = parseDateTime(inDateStr, inTimeStr);
    }
    if (!inDT || !isValid(inDT)) {
      if (activeRecord.inDateTime) {
        try { inDT = parseISO(activeRecord.inDateTime); } catch {}
      }
    }

    let finalHours = 0;
    if (inDT && isValid(inDT)) {
      let diffMs = outDT.getTime() - inDT.getTime();
      // Handle overnight shift crossing midnight
      if (diffMs < 0) {
        const nextDayOutDT = addHours(outDT, 24);
        if (nextDayOutDT.getTime() - inDT.getTime() >= 0 && nextDayOutDT.getTime() - inDT.getTime() <= 24 * 3600 * 1000) {
          outDT = nextDayOutDT;
          diffMs = outDT.getTime() - inDT.getTime();
        }
      }

      if (diffMs < 0) {
        // OUT is before IN — reject the request
        return NextResponse.json(
          { success: false, message: "Mark OUT time cannot be earlier than Mark IN time. Please check the system clock." },
          { status: 400 }
        );
      }
      // Store exact elapsed minutes divided by 60 for perfect HH:MM alignment
      const elapsedMinutes = Math.max(0, Math.round(diffMs / 60000));
      finalHours = parseFloat((elapsedMinutes / 60).toFixed(4));
    }

    // Cap at 24 hours maximum
    finalHours = Math.min(finalHours, 24);
    finalHours = parseFloat(finalHours.toFixed(4));

    const {
      latitude,
      longitude,
      lat,
      lng,
      address,
      outPlant,
      plantName,
      street,
      area,
      city,
      state,
      pincode,
    } = body;

    const finalLat = parseFloat(lat ?? latitude ?? activeRecord.lat ?? 28.6329);
    const finalLng = parseFloat(lng ?? longitude ?? activeRecord.lng ?? 77.4357);
    const finalAddress = address || activeRecord.address || "Registered Location";
    const finalOutPlant = outPlant || plantName || activeRecord.inPlant || "Registered Plant";

    const updatePayload: any = {
      outTime: outTimeStr,
      outDate: outDateStr,
      outDateTime: outDT.toISOString(),
      hours: finalHours,
      status: 'Closed',
      outType: 'Manual',
      latOut: finalLat,
      lngOut: finalLng,
      addressOut: finalAddress,
      streetOut: street || activeRecord.street || "Plant",
      areaOut: area || activeRecord.area || "Plant Radius Zone",
      cityOut: city || activeRecord.city || "NCR",
      stateOut: state || activeRecord.state || "Uttar Pradesh",
      pincodeOut: pincode || activeRecord.pincode || "N/A",
      outPlant: finalOutPlant,
      nextInEnableTime: null, // No cooldown — next Mark IN allowed on next calendar date
      currentGeofenceStatus: "Shift Closed",
      updatedAt: now.toISOString(),
    };

    // Close any uncompleted exit events
    if (Array.isArray(activeRecord.exitEvents)) {
      const updatedEvents = activeRecord.exitEvents.map((evt: any) => {
        if (!evt.inPlantTime && evt.trackingStatus === "Outside Plant") {
          return {
            ...evt,
            inPlantTime: format(now, "yyyy-MM-dd HH:mm"),
            trackingStatus: "Shift Closed",
          };
        }
        return evt;
      });
      updatePayload.exitEvents = updatedEvents;
    }

    // Also close any active open plantExits in plantExits collection
    await db.collection('plantExits').updateMany(
      {
        $or: [
          { attendanceId: String(activeRecord._id) },
          { employeeCode: { $in: [internalEmpId, matchedEmp.employeeId, matchedEmp.id].filter(Boolean) }, inPlantTime: null }
        ]
      },
      {
        $set: {
          inPlantTime: format(now, "yyyy-MM-dd HH:mm"),
          trackingStatus: "Shift Closed",
          updatedAt: now.toISOString()
        }
      }
    ).catch(() => {});

    await attendanceCol.updateOne(
      { _id: activeRecord._id },
      { $set: updatePayload }
    );

    const savedRecord = { ...activeRecord, ...updatePayload, id: String(activeRecord._id) };

    const empFullName = matchedEmp.firstName
      ? `${matchedEmp.firstName} ${matchedEmp.lastName || ''}`.trim()
      : (matchedEmp.name || matchedEmp.fullName || "Employee");

    // Fast in-memory cache mutation & invalidation
    updateCachedCollection('attendance', 'UPDATE', savedRecord);
    invalidateBootstrapCache();

    // Run non-critical telemetry asynchronously
    if (typeof finalLat === 'number' && typeof finalLng === 'number' && !isNaN(finalLat) && !isNaN(finalLng)) {
      db.collection('employee_devices').updateOne(
        {
          $or: [
            { employeeId: internalEmpId },
            { employeeId: matchedEmp.employeeId },
            { employeeName: empFullName },
          ],
        },
        {
          $set: {
            employeeId: internalEmpId,
            employeeName: empFullName,
            gpsLatitude: finalLat,
            gpsLongitude: finalLng,
            completeAddress: finalAddress,
            locationAddress: finalAddress,
            lastActiveAt: now.toISOString(),
            lastHeartbeatAt: now.toISOString(),
            updatedAt: now.toISOString(),
            isActive: true,
            active: true,
            deviceStatus: 'ACTIVE',
          },
          $setOnInsert: {
            createdAt: now.toISOString(),
          },
        },
        { upsert: true }
      ).catch(() => {});
    }

    // Broadcast real-time event to active clients
    realtimeBroadcaster.broadcast('attendance_updated', {
      collection: 'attendance',
      action: 'update',
      data: savedRecord,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Attendance Marked OUT Successfully!",
        data: savedRecord
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Mark OUT API Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error during Mark OUT." },
      { status: 500 }
    );
  }
}
