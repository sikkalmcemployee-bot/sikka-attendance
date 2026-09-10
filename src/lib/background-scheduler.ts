let isSchedulerRunning = false;
let historicalAuditDone = false;

/**
 * IST-aware Background Scheduler for Server-side Automatic Mark OUT processing.
 */



export function startBackgroundScheduler() {
  if (isSchedulerRunning) {
    return;
  }
  isSchedulerRunning = true;

  const istTime = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  console.log(`[Scheduler] IST-Aware Background Scheduler started at ${istTime} IST.`);

  // ── Startup sequence ────────────────────────────────────────────────────
  // Begin normal scheduler cycles (auto-out) after server init
  setTimeout(() => {
    runSchedulerCycle();
  }, 5000);

  // Poll every 60 seconds — auto-out
  setInterval(() => {
    runSchedulerCycle();
  }, 60 * 1000);
}

async function runSchedulerCycle() {
  // 1. Auto-Mark OUT: Evaluates every cycle for active sessions exceeding 16h (session 1) or 8h (session 2)
  try {
    const { GET: handleAutoMarkOut } = await import('@/app/api/attendance/auto-mark-out/route');
    const autoOutRes = await handleAutoMarkOut();
    const autoOutData = await autoOutRes.json();
    if (autoOutData.processedCount > 0) {
      console.log(`[Scheduler] Auto Mark OUT completed for ${autoOutData.processedCount} expired session(s).`);
    }
  } catch (autoErr) {
    console.warn('[Scheduler] Auto Mark OUT cycle error:', autoErr);
  }
}

