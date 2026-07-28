/** Round a USD amount to cents. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Round to 1 decimal (used for percentages). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The Monday (UTC) of the ISO week containing `dateStr` (YYYY-MM-DD),
 * returned as YYYY-MM-DD. Used to bucket spend by week.
 */
export function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? 6 : dow - 1; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}
