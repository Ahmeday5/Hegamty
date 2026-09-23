/**
 * Locale formatting helpers. Arabic month/day names with Latin digits
 * (`-u-nu-latn`) — the convention most Gulf/Egyptian dashboards use, and it
 * keeps phone numbers, IDs and amounts visually consistent.
 */
export const APP_LOCALE = 'ar-SA-u-nu-latn-ca-gregory';

const numberFmt = new Intl.NumberFormat('en-US');
const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat(APP_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(APP_LOCALE, {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
});
const longDateFmt = new Intl.DateTimeFormat(APP_LOCALE, {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '0';
  return decimals > 0
    ? value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : numberFmt.format(Math.round(value));
}

export function formatCompact(value: number): string {
  return compactFmt.format(value);
}

/** Amount + currency symbol. Multi-country pages use the `cmoney` / `smoney` pipes instead. */
export function formatMoney(value: number, symbol: string): string {
  return `${formatNumber(value)} ${symbol}`.trim();
}

export function formatDate(value: string | number | Date): string {
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: string | number | Date): string {
  return dateTimeFmt.format(new Date(value));
}

export function formatLongDate(value: string | number | Date): string {
  return longDateFmt.format(new Date(value));
}

/** "منذ 5 دقائق" style relative time. */
const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
export function formatRelative(value: string | number | Date): string {
  const diffSec = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), 'month');
  return rtf.format(Math.round(diffSec / (86400 * 365)), 'year');
}
