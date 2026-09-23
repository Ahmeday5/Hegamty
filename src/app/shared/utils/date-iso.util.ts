/**
 * ISO (`YYYY-MM-DD`) date helpers using LOCAL timezone date components —
 * `Date#toISOString()` converts to UTC first, which silently shifts the
 * calendar day for any timezone offset from UTC. Use these instead whenever
 * you need "today's date" or "N months from today" as a plain date string.
 */

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIsoDate(): string {
  return toIsoDate(new Date());
}

export function plusMonthsIsoDate(months: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return toIsoDate(d);
}

export function isValidIsoDate(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}
