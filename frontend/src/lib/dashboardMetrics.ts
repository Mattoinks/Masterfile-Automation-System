import type { LogEntry } from '@/api';

const SPARKLINE_DAYS = 7;

// Real per-day counts derived from the actual audit log - never a fabricated series.
export function dailyCounts(
  logs: LogEntry[],
  match: (log: LogEntry) => boolean,
  days: number = SPARKLINE_DAYS
): number[] {
  const buckets: Record<string, number> = {};
  const keys: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    keys.push(key);
    buckets[key] = 0;
  }
  for (const log of logs) {
    const day = log.timestamp.slice(0, 10);
    if (day in buckets && match(log)) buckets[day] += 1;
  }
  return keys.map((k) => buckets[k]);
}

export function trend(series: number[]): number | null {
  if (series.length < 2) return null;
  const today = series[series.length - 1];
  const prior = series.slice(0, -1).reduce((sum, v) => sum + v, 0) / (series.length - 1);
  if (prior === 0) return null;
  return Math.round(((today - prior) / prior) * 100);
}
