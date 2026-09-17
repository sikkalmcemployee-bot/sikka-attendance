import { NextResponse } from 'next/server';
import { processAutoMarkOut } from '@/lib/auto-mark-out';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await processAutoMarkOut();
  const status = result.success ? 200 : (result.error === 'Database unavailable' ? 503 : 500);
  return NextResponse.json(result, { status });
}

export async function POST() {
  const result = await processAutoMarkOut();
  const status = result.success ? 200 : (result.error === 'Database unavailable' ? 503 : 500);
  return NextResponse.json(result, { status });
}
