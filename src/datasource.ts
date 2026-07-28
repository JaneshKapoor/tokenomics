import type { UsageRecord } from "./types.js";

/**
 * A DataSource yields normalized {@link UsageRecord}s for a date window.
 *
 * All tool logic is implemented once against this interface (see
 * `src/tools/`), so swapping Synthetic ↔ Prometheus is a one-line env switch
 * and requires no tool changes.
 */
export interface DataSource {
  /**
   * Return every usage record whose timestamp falls within
   * [startDate, endDate] inclusive. Dates are ISO date strings (YYYY-MM-DD);
   * a record on endDate up to 23:59:59 is included.
   *
   * When start/end are omitted the source returns its full available window.
   */
  getUsageRecords(startDate?: string, endDate?: string): Promise<UsageRecord[]>;

  /** A short human-readable label used in logs / diagnostics. */
  readonly name: string;
}

/**
 * Inclusive date-window filter shared by every DataSource implementation.
 * `startDate`/`endDate` are YYYY-MM-DD; endDate is treated as end-of-day.
 */
export function withinWindow(
  records: UsageRecord[],
  startDate?: string,
  endDate?: string,
): UsageRecord[] {
  const startMs = startDate ? Date.parse(`${startDate}T00:00:00.000Z`) : -Infinity;
  const endMs = endDate ? Date.parse(`${endDate}T23:59:59.999Z`) : Infinity;
  return records.filter((r) => {
    const t = Date.parse(r.timestamp);
    return t >= startMs && t <= endMs;
  });
}
