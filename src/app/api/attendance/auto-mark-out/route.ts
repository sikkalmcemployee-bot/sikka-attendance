import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { format, parseISO, addHours, isValid } from 'date-fns';
import { invalidateBootstrapCache, updateCachedCollection } from '@/lib/data-cache';
import { parseDateTime } from '@/lib/utils';
import { realtimeBroadcaster } from '@/lib/realtime-events';

export const dynamic = 'force-dynamic';

const getISTTime = () => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

export async function GET() {
  return processAutoMarkOut();
}

export async function POST() {
  return processAutoMarkOut();
}

async function processAutoMarkOut() {
  try {
    const db = await getDb().catch((err) => {
      console.warn("[Auto-Out] MongoDB connection deferred:", err?.message || err);
      return null;
    });
    if (!db) {
      return NextResponse.json({ success: false, message: "Database unavailable", processedCount: 0 }, { status: 503 });
    }

    const attendanceCol = db.collection('attendance');
    const plantExitsCol = db.collection('plantExits');

    // Find all active Open attendance records
    const openRecords = await attendanceCol.find({ status: 'Open' }).toArray();
    const now = getISTTime();
    const nowDT = parseDateTime(format(now, "yyyy-MM-dd"), format(now, "HH:mm")) || now;
    const processedRecords = [];

    for (const record of openRecords) {
      let inDT: Date | null = null;
      if (record.inDate && record.inTime) {
        inDT = parseDateTime(record.inDate, record.inTime);
      } else if (record.date && record.inTime) {
        inDT = parseDateTime(record.date, record.inTime);
      } else if (record.inDateTime) {
        try { inDT = parseISO(record.inDateTime); } catch {}
      }

      if (!inDT || !isValid(inDT)) continue;

      const elapsedHours = (nowDT.getTime() - inDT.getTime()) / (1000 * 60 * 60);

      // Auto Mark OUT Rule:
      // Trigger: 18 hours after Mark IN
      // Recorded Mark OUT time: 8 hours after Mark IN (for working-hour calculation)
      // These are two separate values — trigger time vs. recorded time.
      const thresholdHours = 18;
      const creditedHours = 8.0;

      if (elapsedHours >= thresholdHours) {
        // Record the Mark OUT at inDT + 8h (not the actual trigger time)
        const creditOutDT = addHours(inDT, creditedHours);
        const finalOutDate = format(creditOutDT, "yyyy-MM-dd");
        const finalOutTime = format(creditOutDT, "HH:mm");

        const updatePayload: any = {
          outTime: finalOutTime,
          outDate: finalOutDate,
          outDateTime: creditOutDT.toISOString(),
          hours: creditedHours,
          status: 'Auto OUT',
          outType: 'Auto',
          markOutType: 'AUTO',
          autoOut: true,
          autoCheckout: true,
          autoTriggerTime: now.toISOString(),
          nextInEnableTime: null, // Next Mark IN is allowed on the next calendar date only
          currentGeofenceStatus: "Shift Closed",
          remark: `System Auto-Logged OUT (18h limit reached). Recorded working time: ${creditedHours}h (8h after Mark IN).`,
          updatedAt: now.toISOString(),
        };

        // Close uncompleted exit events
        if (Array.isArray(record.exitEvents)) {
          updatePayload.exitEvents = record.exitEvents.map((evt: any) => {
            if (!evt.inPlantTime && evt.trackingStatus === "Outside Plant") {
              return {
                ...evt,
                inPlantTime: format(now, "yyyy-MM-dd HH:mm"),
                trackingStatus: "Shift Closed",
              };
            }
            return evt;
          });
        }

        // Close open plantExits
        await plantExitsCol.updateMany(
          {
            $or: [
              { attendanceId: String(record._id) },
              { employeeCode: record.employeeId, inPlantTime: null }
            ]
          },
          {
            $set: {
              inPlantTime: format(now, "yyyy-MM-dd HH:mm"),
              trackingStatus: "Shift Closed",
              updatedAt: now.toISOString(),
            }
          }
        ).catch(() => {});

        await attendanceCol.updateOne(
          { _id: record._id },
          { $set: updatePayload }
        );

        const autoOutSavedRecord = { ...record, ...updatePayload, id: String(record._id) };
        updateCachedCollection('attendance', 'UPDATE', autoOutSavedRecord);

        // Broadcast real-time event AFTER confirmed MongoDB save
        realtimeBroadcaster.broadcast('attendance_updated', {
          collection: 'attendance',
          action: 'auto_out',
          data: autoOutSavedRecord,
        });

        processedRecords.push({
          id: String(record._id),
          employeeId: record.employeeId,
          employeeName: record.employeeName,
          creditedHours,
          recordedOutTime: `${finalOutDate} ${finalOutTime}`,
          triggerTime: now.toISOString(),
        });
      }
    }

    if (processedRecords.length > 0) {
      invalidateBootstrapCache();
    }

    return NextResponse.json({
      success: true,
      processedCount: processedRecords.length,
      processedRecords,
      executedAt: now.toISOString(),
    });
  } catch (error: any) {
    console.error("Auto Mark OUT processor error:", error?.message || error);
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}
