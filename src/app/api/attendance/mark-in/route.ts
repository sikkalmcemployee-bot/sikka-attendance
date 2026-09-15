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

    // 4. Check for any existing active Open shift (across all dates)
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

      const openSessionIdx = anyOpenShift.sessionIndex || 1;
      const thresholdHours = openSessionIdx === 2 ? 8 : 16;
      const creditedHours = openSessionIdx === 2 ? 4.0 : 8.0;

      if (openInDT && isValid(openInDT)) {
        const elapsedHours = (now.getTime() - openInDT.getTime()) / (1000 * 60 * 60);
        if (elapsedHours >= thresholdHours) {
          // Auto-close expired shift with credited hours (+8h for S1, +4h for S2)
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
            nextInEnableTime: now.toISOString(), // Immediate eligibility per requirement 5
            currentGeofenceStatus: "Shift Closed",
            remark: `System Auto-Logged OUT (${thresholdHours}h Limit reached for Session ${openSessionIdx}); Credited ${creditedHours}h fixed working time.`,
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

    // 5. Check today's existing attendance sessions (Max 2 sessions per day)
    const todaySessions = await attendanceCol.find({
      employeeId: { $in: empIdMatches },
      date: todayStr
    }).sort({ createdAt: 1 }).toArray();

    if (todaySessions.length >= 2) {
      return NextResponse.json(
        {
          success: false,
          message: "You have already used the maximum 2 attendance sessions allowed for today."
        },
        { status: 400 }
      );
    }

    // 6. If Session 1 completed, validate the 2-minute waiting period
    if (todaySessions.length === 1) {
      const s1 = todaySessions[0];
      const isAutoOut = s1.autoOut || s1.outType === 'Auto';
      // Only manual Mark OUT has a 2-minute waiting period. Auto OUT after 16 hours allows immediate Mark IN (Requirement 5).
      if (!isAutoOut) {
        let s1OutDT: Date | null = null;
        if (s1.outDateTime) {
          try { s1OutDT = parseISO(s1.outDateTime); } catch {}
        }
        if (!s1OutDT || !isValid(s1OutDT)) {
          if (s1.outDate && s1.outTime) {
            s1OutDT = parseDateTime(s1.outDate, s1.outTime);
          }
        }
        if (s1OutDT && isValid(s1OutDT)) {
          const enableTimeMs = s1OutDT.getTime() + (2 * 60 * 1000); // exactly 2 minutes
          if (now.getTime() < enableTimeMs) {
            const remainingSec = Math.ceil((enableTimeMs - now.getTime()) / 1000);
            return NextResponse.json(
              {
                success: false,
                message: `Please wait for the 2-minute rest period to complete. Remaining time: ${remainingSec}s.`
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // 7. Duplicate request protection (prevent double-taps within 5 seconds)
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

    const sessionIndex = todaySessions.length + 1; // 1 for first session, 2 for second session

    // 5. Build Attendance Record with all required fields
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

    // 4c. Rule: Session 2 Mark IN Validation (Session 2 is strictly restricted to plant premises only)
    if (sessionIndex === 2) {
      const plants = await db.collection('plants').find({ active: { $ne: false } }).toArray().catch(() => []);
      let isWithinAnyPlant = false;
      let matchedPlantObj: any = null;
      const R_EARTH = 6371e3; // meters
      for (const p of plants) {
        if (typeof p.lat === 'number' && typeof p.lng === 'number') {
          const phi1 = (finalLat * Math.PI) / 180;
          const phi2 = (p.lat * Math.PI) / 180;
          const deltaPhi = ((p.lat - finalLat) * Math.PI) / 180;
          const deltaLambda = ((p.lng - finalLng) * Math.PI) / 180;
          const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = R_EARTH * c;
          if (distance <= (p.radius || 700)) {
            isWithinAnyPlant = true;
            matchedPlantObj = p;
            break;
          }
        }
      }

      if (!isWithinAnyPlant) {
        return NextResponse.json(
          {
            success: false,
            message: "2nd session me Mark IN sirf plant ke andar se hi allow hai. Plant ke bahar se 2nd session Mark IN nahi ho sakta."
          },
          { status: 400 }
        );
      }
    }

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
      sessionIndex,
      sessionNumber: sessionIndex,
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
      remark: body.remark || `Checked IN (Session ${sessionIndex}) for ${finalAttendanceType}`,
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
        message: `Attendance Marked IN Successfully! (Session ${sessionIndex} of 2)`,
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
