import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getCachedBootstrapData, setCachedBootstrapData, getInFlightPromise, setInFlightPromise } from '@/lib/data-cache';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR'];

/**
 * High-Performance Single-Roundtrip Data Bootstrap API
 * Returns all necessary MongoDB collections in a single unified payload.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    // Resolve session user for notification & query filtering
    let sessionUser: any = null;
    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get('sikka_session')?.value;
      if (sessionCookie) {
        try { sessionUser = JSON.parse(sessionCookie); } catch {}
      }
    } catch {
      // cookies() throws when called outside request scope (e.g. background pre-warmer or cron)
      try {
        const cookieHeader = req.headers.get('cookie') || '';
        const match = cookieHeader.match(/sikka_session=([^;]+)/);
        if (match && match[1]) {
          sessionUser = JSON.parse(decodeURIComponent(match[1]));
        }
      } catch {}
    }

    // Header/Query fallback if cookie is absent
    const roleParam = searchParams.get('role') || req.headers.get('x-user-role');
    const empIdParam = searchParams.get('empId') || req.headers.get('x-employee-id');

    const sessionRole = String(sessionUser?.role || roleParam || '').toUpperCase();
    const isAdmin = ADMIN_ROLES.includes(sessionRole);
    const sessionEmpId = sessionUser?.employeeId || sessionUser?.username || sessionUser?.id || empIdParam || '';

    // Check high-speed in-memory cache
    const cacheKey = isAdmin ? 'admin_all' : `emp_${sessionEmpId || 'public'}`;
    if (!forceRefresh) {
      const cached = getCachedBootstrapData(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            'Cache-Control': 'no-cache, must-revalidate',
            'X-Cache-Status': 'HIT',
          },
        });
      }

      // Deduplicate concurrent in-flight admin requests to avoid duplicate DB query storms
      const inFlight = getInFlightPromise();
      if (inFlight && isAdmin) {
        const payload = await inFlight;
        if (payload) {
          return NextResponse.json(payload, {
            headers: {
              'Cache-Control': 'no-cache, must-revalidate',
              'X-Cache-Status': 'COALESCED',
            },
          });
        }
      }
    }

    const db = await getDb().catch((err) => {
      console.warn('[Bootstrap] MongoDB connection deferred:', err?.message || err);
      return null;
    });
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    // Build employee-specific queries if authenticated as standard employee
    let attendanceQuery: any = {};
    const targetIds = new Set<string>();

    if (!isAdmin && sessionEmpId) {
      targetIds.add(sessionEmpId);
      // Resolve all aliases for this employee
      const matchedEmp = await db.collection('employees').findOne({
        $or: [
          { employeeId: sessionEmpId },
          { id: sessionEmpId },
          { mobile: sessionEmpId },
          { mobileNumber: sessionEmpId },
          { username: sessionEmpId },
          { aadhaar: sessionEmpId },
          { aadhaarNumber: sessionEmpId },
        ],
      }).catch(() => null);

      if (matchedEmp) {
        if (matchedEmp.employeeId) targetIds.add(matchedEmp.employeeId);
        if (matchedEmp.id) targetIds.add(String(matchedEmp.id));
        if (matchedEmp.mobile) targetIds.add(matchedEmp.mobile);
        if (matchedEmp.mobileNumber) targetIds.add(matchedEmp.mobileNumber);
        if (matchedEmp.aadhaar) targetIds.add(matchedEmp.aadhaar);
        if (matchedEmp.aadhaarNumber) targetIds.add(matchedEmp.aadhaarNumber);
        if (matchedEmp.username) targetIds.add(matchedEmp.username);
        if (matchedEmp.name) targetIds.add(matchedEmp.name);
        if ((matchedEmp as any).fullName) targetIds.add((matchedEmp as any).fullName);
      }

      const empIds = Array.from(targetIds).filter(Boolean);

      // Build attendance query: employee gets complete personal history
      attendanceQuery = {
        $or: [
          { employeeId: { $in: empIds } },
          { employeeName: { $in: empIds } },
        ]
      };
    }

    const fetchPromise = (async () => {
      // Fetch all collections in parallel without arbitrary truncation
      const [
        employees,
        attendance,
        plants,
        holidays,
        leaveRequests,
        firms,
        users,
      ] = await Promise.all([
        db.collection('employees').find({}).batchSize(500).toArray().catch((err) => { console.error('[Bootstrap] employees error:', err); return []; }),
        db.collection('attendance').find(attendanceQuery, {
          projection: {
            employeeId: 1,
            employeeName: 1,
            date: 1,
            inDate: 1,
            outDate: 1,
            inTime: 1,
            outTime: 1,
            hours: 1,
            status: 1,
            attendanceType: 1,
            approved: 1,
            approvedBy: 1,
            inPlant: 1,
            outPlant: 1,
            remark: 1,
            address: 1,
            addressOut: 1,
            autoCheckout: 1,
            autoOut: 1,
            unapprovedOutDuration: 1,
            inDateTime: 1,
            outDateTime: 1,
            approvalActionDate: 1,
            editedBy: 1,
            createdAt: 1,
            updatedAt: 1,
            exitEvents: 1,
            currentGeofenceStatus: 1,
            latitude: 1,
            longitude: 1,
            latitudeOut: 1,
            longitudeOut: 1,
            gpsLatitude: 1,
            gpsLongitude: 1,
            area: 1,
            areaOut: 1,
            accuracy: 1,
            accuracyOut: 1
          }
        }).batchSize(5000).sort({ date: -1 }).toArray().catch((err) => { console.error('[Bootstrap] attendance error:', err); return []; }),
        db.collection('plants').find({}).toArray().catch((err) => { console.error('[Bootstrap] plants error:', err); return []; }),
        db.collection('holidays').find({}).toArray().catch((err) => { console.error('[Bootstrap] holidays error:', err); return []; }),
        db.collection('leaveRequests').find({}).sort({ createdAt: -1, fromDate: -1 }).toArray().catch((err) => { console.error('[Bootstrap] leaveRequests error:', err); return []; }),
        db.collection('firms').find({}).toArray().catch((err) => { console.error('[Bootstrap] firms error:', err); return []; }),
        db.collection('users').find({}).toArray().catch((err) => { console.error('[Bootstrap] users error:', err); return []; }),
      ]);

      const normalizeList = (list: any[]) => {
        return (list || []).map(item => {
          if (!item) return item;
          const strId = String(item._id || item.id || '');
          return {
            ...item,
            _id: strId,
            id: item.id || strId
          };
        });
      };

      return {
        employees: normalizeList(employees),
        attendance: normalizeList(attendance),
        plants: normalizeList(plants),
        holidays: normalizeList(holidays),
        leaveRequests: normalizeList(leaveRequests),
        notifications: [],
        vouchers: [],
        firms: normalizeList(firms),
        users: normalizeList(users),
        payroll: [],
      };
    })();

    if (isAdmin) {
      setInFlightPromise(fetchPromise);
    }

    let payload;
    try {
      payload = await fetchPromise;
    } finally {
      if (isAdmin) {
        setInFlightPromise(null);
      }
    }

    // Store in in-memory cache for fast sub-millisecond future requests
    setCachedBootstrapData(payload, cacheKey);

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-cache, must-revalidate',
        'X-Cache-Status': 'MISS',
      },
    });
  } catch (error: any) {
    console.error('Data bootstrap error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to bootstrap data' }, { status: 500 });
  }
}
