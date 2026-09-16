import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getSessionUser, isEmployeeRole } from '@/lib/auth/session';
import { format, parseISO, addHours, isValid } from 'date-fns';
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

    // 1. Mandatory Role-Based Security: Only EMPLOYEE can Mark IN
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

    // Check account status
    if (matchedEmp.active === false || matchedEmp.isActive === false || matchedEmp.status === 'Inactive') {
      return NextResponse.json(
        { success: false, message: "Access Denied: Employee account is currently inactive." },
        { status: 403 }
      );
    }

    const empFullName = matchedEmp.firstName
      ? `${matchedEmp.firstName} ${matchedEmp.lastName || ''}`.trim()
      : (matchedEmp.name || matchedEmp.fullName || "Employee");

    const now = getISTTime();
    const todayStr = format(now, "yyyy-MM-dd");
    const timeStr = format(now, "HH:mm");

    const empIdMatches = [internalEmpId, matchedEmp.employeeId, matchedEmp.id, cleanSessionEmpId].filter(Boolean);

    // 4. Check for any existing active Open shift and auto-close if stale (16h threshold)
    const anyOpenShift = await attendanceCol.findOne({
      employeeId: { $in: empIdMatches },
      status: 'Open'
    });

    if (anyOpenShift) {
      let openInDT: Date | null = null;
      if (anyOpenShift.inDate && anyOpenShift.inTime) {
        openInDT = parseDateTime(anyOpenShift.inDate, anyOpenShift.inTime);
      } else if (anyOpenShift.date && anyOpenShift.inTime) {
        openInDT = parseDateTime(anyOpenShift.date, anyOpenShift.inTime);
      } else if (anyOpenShift.inDateTime) {
        try { openInDT = parseISO(anyOpenShift.inDateTime); } catch {}
      }

      // Auto Mark OUT: trigger at 16 hours after Mark IN, record 8 hours of working time
      const thresholdHours = 16;
      const creditedHours = 8.0;

      if (openInDT && isValid(openInDT)) {
        const elapsedHours = (now.getTime() - openInDT.getTime()) / (1000 * 60 * 60);
        if (elapsedHours >= thresholdHours) {
          // Auto-close the stale open shift: record OUT at inDT + 8h (not trigger time)
          const creditOutDT = addHours(openInDT, creditedHours);
          const autoOutPayload: any = {
            outTime: format(creditOutDT, "HH:mm"),
            outDate: format(creditOutDT, "yyyy-MM-dd"),
            outDateTime: creditOutDT.toISOString(),
            hours: creditedHours,
            status: 'Auto OUT',
            outType: 'Auto',
            autoOut: true,
            autoCheckout: true,
            autoTriggerTime: now.toISOString(),
            nextInEnableTime: now.toISOString(),
            currentGeofenceStatus: "Shift Closed",
            remark: `System Auto-Logged OUT (16h limit reached). Recorded working time: ${creditedHours}h.`,
            updatedAt: now.toISOString(),
          };
          await attendanceCol.updateOne({ _id: anyOpenShift._id }, { $set: autoOutPayload });
          const autoOutRecord = { ...anyOpenShift, ...autoOutPayload, id: String(anyOpenShift._id) };
          updateCachedCollection('attendance', 'UPDATE', autoOutRecord);
          realtimeBroadcaster.broadcast('attendance_updated', {
            collection: 'attendance',
            action: 'auto_out',
            data: autoOutRecord,
          });
          // After auto-closing the stale open shift, fall through to create today's new Mark IN
        } else {
          return NextResponse.json(
            {
              success: false,
              message: "You already have an active Mark IN shift. Please Mark OUT first.",
              data: anyOpenShift
            },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          {
            success: false,
            message: "You already have an active Mark IN shift. Please Mark OUT first.",
            data: anyOpenShift
          },
          { status: 400 }
        );
      }
    }

    // 5. ONE MARK IN PER EMPLOYEE PER CALENDAR DATE
    // Check if any attendance record (any status) already exists for this employee today.
    const todayRecord = await attendanceCol.findOne({
      employeeId: { $in: empIdMatches },
      date: todayStr
    });

    if (todayRecord) {
      return NextResponse.json(
        {
          success: false,
          message: "You have already marked IN for today. A new Mark IN is only allowed on the next calendar date.",
          data: todayRecord
        },
        { status: 400 }
      );
    }

    // 6. Duplicate request protection (prevent double-taps within 5 seconds)
    const recentRecord = await attendanceCol.findOne(
      { employeeId: { $in: empIdMatches } },
      { sort: { createdAt: -1 } }
    );
    if (recentRecord && recentRecord.createdAt) {
      const recentTime = new Date(recentRecord.createdAt).getTime();
      if (now.getTime() - recentTime < 5000) {
        return NextResponse.json(
          { success: false, message: "A request was just processed. Please avoid duplicate submissions." },
          { status: 429 }
        );
      }
    }

    // 7. Build Attendance Record with all required fields
    const {
      latitude,
      longitude,
      lat,
      lng,
      address,
      inPlant,
      plantName,
      attendanceType,
      selectedType,
      street,
      area,
      city,
      state,
      pincode,
      currentGeofenceStatus,
    } = body;

    const finalLat = parseFloat(lat ?? latitude ?? 28.6329);
    const finalLng = parseFloat(lng ?? longitude ?? 77.4357);

    const finalAddress = address || (inPlant ? String(inPlant) : "Registered Location");
    const finalPlant = inPlant || plantName || (selectedType === 'WFH' ? 'Outside-WFM' : selectedType === 'FIELD' ? 'Outside-Field Work' : 'N/A');
    const finalAttendanceType = attendanceType || (selectedType === 'WFH' ? 'Work From Home' : selectedType === 'FIELD' ? 'Field Work' : 'Plant Attendance');
    const geofenceStatus = currentGeofenceStatus || (finalPlant.startsWith('Outside') ? 'Outside Plant' : 'Inside Plant');

    const newAttendanceRecord = {
      employeeId: internalEmpId,
      employeeName: empFullName,
      aadhaarNumber: matchedEmp.aadhaarNumber || matchedEmp.aadhaar ? "[Aadhaar Redacted]" : undefined,
      mobileNumber: matchedEmp.mobileNumber || matchedEmp.mobile || undefined,
      firmId: matchedEmp.firmId || null,
      plantId: matchedEmp.plantId || null,
      sessionIndex: 1,
      sessionNumber: 1,
      date: todayStr,
      inDate: todayStr,
      inTime: timeStr,
      inDateTime: `${todayStr}T${timeStr}:00.000Z`,
      hours: 0,
      status: 'Open',
      attendanceType: finalAttendanceType,
      lat: finalLat,
      lng: finalLng,
      address: finalAddress,
      street: street || finalPlant,
      area: area || (geofenceStatus === 'Inside Plant' ? "Plant Radius Zone" : "Outside Zone"),
      city: city || "NCR",
      state: state || "Uttar Pradesh",
      pincode: pincode || "N/A",
      inPlant: finalPlant,
      remark: body.remark || `Checked IN for ${finalAttendanceType}`,
      approved: false,
      unapprovedOutDuration: 0,
      currentGeofenceStatus: geofenceStatus,
      exitEvents: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const result = await attendanceCol.insertOne(newAttendanceRecord);
    const recordId = result.insertedId;
    const savedRecord = { ...newAttendanceRecord, id: String(recordId), _id: String(recordId) };

    // Fast in-memory cache mutation & invalidation
    updateCachedCollection('attendance', 'INSERT', savedRecord);
    invalidateBootstrapCache();

    // Run non-critical telemetry asynchronously
    if (typeof finalLat === 'number' && typeof finalLng === 'number') {
      db.collection('employee_devices').updateOne(
        {
          $or: [
            { employeeId: internalEmpId },
            { employeeId: cleanSessionEmpId },
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
      action: 'insert',
      data: savedRecord,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Attendance Marked IN Successfully!`,
        id: recordId,
        data: savedRecord,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Mark IN API Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error during Mark IN." },
      { status: 500 }
    );
  }
}
