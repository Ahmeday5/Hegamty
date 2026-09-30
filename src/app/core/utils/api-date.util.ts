/**
 * Normalizes a .NET timestamp (e.g. `2026-09-29T12:11:24.9194145`, 7-digit
 * ticks) to an ISO string every browser parses: the fraction is cut to
 * milliseconds. Returns `null` for missing/unparseable values and for
 * `0001-01-01` (`DateTime.MinValue`, i.e. "never set").
 */
export function parseApiDate(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || v.startsWith('0001-01-01')) return null;
  const normalized = v.replace(/(\.\d{3})\d+/, '$1');
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}
