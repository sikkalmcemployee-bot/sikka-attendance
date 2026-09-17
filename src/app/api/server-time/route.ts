import { NextResponse } from 'next/server';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  const now = new Date();
  const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

  return NextResponse.json({
    success: true,
    timestamp: now.getTime(),
    iso: now.toISOString(),
    ist: format(istDate, 'yyyy-MM-dd HH:mm:ss'),
    date: format(istDate, 'yyyy-MM-dd'),
    time: format(istDate, 'HH:mm'),
    timezone: 'Asia/Kolkata',
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
