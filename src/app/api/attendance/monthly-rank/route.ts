import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/monthly-rank?month=2026-09&employeeId=EMP-S0003
 *
 * Returns the competition rank of the given employee among all employees
 * for the specified month (yyyy-MM), based on total worked hours.
 *
 * Ranking rule: Standard competition ranking (1, 2, 2, 4...)
 * - Sort all employees by total worked minutes DESC
 * - Equal minutes -> same rank; next rank skips accordingly
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get('month'); // e.g. "2026-09"
    const employeeIdParam = (searchParams.get('employeeId') || '').trim().toUpperCase();

    if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
      return NextResponse.json({ success: false, message: 'month param required (yyyy-MM)' }, { status: 400 });
    }
    if (!employeeIdParam) {
      return NextResponse.json({ success: false, message: 'employeeId param required' }, { status: 400 });
    }

    const db = await getDb();
    const attendanceCol = db.collection('attendance');

    // Use $regex for reliable month prefix matching on string date fields.
    // This works whether date is "2026-09-15" or "2026-09-15T..." etc.
    const monthRegex = new RegExp(`^${monthParam}`);

    // Compute next month boundary for Date-type fields
    const [yearStr, monStr] = monthParam.split('-');
    const yr = Number(yearStr);
    const mo = Number(monStr);
    const nextYr = mo === 12 ? yr + 1 : yr;
    const nextMo = mo === 12 ? 1 : mo + 1;
    const monthStart = new Date(yr, mo - 1, 1);           // JS Date for comparison
    const monthEnd   = new Date(nextYr, nextMo - 1, 1);   // exclusive upper bound

    // Fetch all attendance records that belong to this month.
    // Cover three cases: string date field, string inDate field, Date-type field.
    const records = await attendanceCol.find(
      {
        $or: [
          { date:    { $regex: monthRegex } },
          { inDate:  { $regex: monthRegex } },
          { date:    { $gte: monthStart, $lt: monthEnd } },
          { inDate:  { $gte: monthStart, $lt: monthEnd } },
          { inDateTime: { $regex: monthRegex } },
        ],
      },
      {
        projection: {
          employeeId:   1,
          employeeName: 1,
          date:         1,
          inDate:       1,
          inTime:       1,
          outTime:      1,
          inDateTime:   1,
          hours:        1,
          sessionIndex: 1,
        }
      }
    ).toArray();

    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

    // Group total minutes per normalized employeeId
    const empMinutes = new Map<string, number>();

    for (const r of records) {
      if (!r) continue;

      // Verify this record belongs to the target month
      const rawDate = r.date || r.inDate || r.inDateTime || '';
      let dateStr = '';
      if (rawDate instanceof Date) {
        dateStr = rawDate.toISOString().substring(0, 7);
      } else {
        dateStr = String(rawDate).trim().substring(0, 7);
      }
      if (dateStr !== monthParam) continue;

      // Only count records with a valid Mark-IN time
      const inTimeStr = String(r.inTime || '').trim();
      if (!inTimeStr) continue;

      const rawId   = String(r.employeeId   || '').trim().toUpperCase();
      const rawName = String(r.employeeName || '').trim().toUpperCase();
      const key = rawId || rawName;
      if (!key) continue;

      // Parse hours — handle string like "8.5" and number 8.5
      let hours = typeof r.hours === 'number'
        ? r.hours
        : (parseFloat(String(r.hours ?? '')) || 0);

      // Auto-out credit for still-open shifts that crossed the threshold
      if (!r.outTime && hours === 0) {
        let inDT: Date | null = null;
        if (r.inDateTime) {
          try { inDT = new Date(r.inDateTime); if (isNaN(inDT.getTime())) inDT = null; } catch {}
        }
        if (!inDT) {
          const datePart = dateStr.length >= 10 ? String(rawDate).substring(0, 10) : '';
          if (datePart && inTimeStr) {
            try { inDT = new Date(`${datePart}T${inTimeStr}`); if (isNaN(inDT.getTime())) inDT = null; } catch {}
          }
        }
        if (inDT) {
          const diffHours = (now.getTime() - inDT.getTime()) / (1000 * 60 * 60);
          const sessionIdx = r.sessionIndex || 1;
          const threshold  = sessionIdx === 2 ? 8  : 16;
          const credited   = sessionIdx === 2 ? 4.0 : 8.0;
          if (diffHours >= threshold) hours = credited;
        }
      }

      empMinutes.set(key, (empMinutes.get(key) || 0) + Math.round(hours * 60));
    }

    if (empMinutes.size === 0) {
      // No attendance data this month — treat as rank 1 (can't determine ranking)
      return NextResponse.json({ success: true, rank: 1, totalEmployees: 1, myMinutes: 0 });
    }

    // Sort descending and assign competition ranks (1, 2, 2, 4...)
    const sorted = Array.from(empMinutes.entries()).sort((a, b) => b[1] - a[1]);
    const rankedList: { key: string; minutes: number; rank: number }[] = [];
    let curRank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i][1] < sorted[i - 1][1]) curRank = i + 1;
      rankedList.push({ key: sorted[i][0], minutes: sorted[i][1], rank: curRank });
    }

    // Match the employee: exact match first, then partial match (prefix) as fallback
    let myEntry = rankedList.find(e => e.key === employeeIdParam);
    if (!myEntry) {
      // Fallback: find by prefix (handles "EMP-S0003" vs "EMPS0003" etc.)
      myEntry = rankedList.find(e =>
        e.key.replace(/[-\s]/g, '') === employeeIdParam.replace(/[-\s]/g, '')
      );
    }

    const myRank = myEntry ? myEntry.rank : rankedList.length;

    return NextResponse.json({
      success: true,
      rank: myRank,
      totalEmployees: rankedList.length,
      myMinutes: myEntry?.minutes ?? 0,
      debug_keys: rankedList.slice(0, 5).map(e => e.key), // first 5 keys for debugging
    });
  } catch (err: any) {
    console.error('[monthly-rank] error:', err);
    return NextResponse.json({ success: false, message: err?.message || 'Server error' }, { status: 500 });
  }
}
