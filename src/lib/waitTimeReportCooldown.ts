export const WAIT_TIME_REPORT_COOLDOWN_MS = 30_000;

const STORAGE_KEY = 'smartcourt_wait_report_cooldown_until';

let reportInFlight = false;

export function getWaitTimeReportCooldownRemainingMs(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const until = localStorage.getItem(STORAGE_KEY);
    if (!until) return 0;
    const remaining = Number(until) - Date.now();
    if (remaining <= 0) {
      localStorage.removeItem(STORAGE_KEY);
      return 0;
    }
    return remaining;
  } catch {
    return 0;
  }
}

export function isWaitTimeReportOnCooldown(): boolean {
  return getWaitTimeReportCooldownRemainingMs() > 0;
}

export function startWaitTimeReportCooldown(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      String(Date.now() + WAIT_TIME_REPORT_COOLDOWN_MS)
    );
  } catch {
    // Ignore storage errors; in-memory lock still applies for this session.
  }
}

/** Blocks duplicate in-flight submits and submissions during the cooldown window. */
export function tryAcquireWaitTimeReportLock(): boolean {
  if (reportInFlight || isWaitTimeReportOnCooldown()) return false;
  reportInFlight = true;
  return true;
}

export function releaseWaitTimeReportLock(): void {
  reportInFlight = false;
}
