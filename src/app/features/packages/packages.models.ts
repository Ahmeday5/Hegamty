/**
 * Technician subscription packages — the platform's only revenue
 * (`/admin/packages`). A technician buys a package in their country's
 * currency; while it's valid the app lets them receive bookings. Customers
 * pay technicians directly, drivers are paid by technicians in cash; neither
 * goes through the app.
 */

// ─────────── durations ───────────

/** Packages are sold in quarter-year steps: 3, 6, 9 or 12 months. */
export type PackagePeriod = 'quarterly' | 'semiannual' | 'ninemonths' | 'yearly';

export interface PeriodMeta {
  label: string;
  /** "كل 3 أشهر" — after a price. */
  per: string;
  months: number;
  /** Counted noun after `months`: "أشهر" / "شهرًا". */
  unit: string;
  /** Sent to the API as `durationDays`. */
  days: number;
}

export const PERIOD_META: Record<PackagePeriod, PeriodMeta> = {
  quarterly: { label: 'ربع سنوية', per: 'كل 3 أشهر', months: 3, unit: 'أشهر', days: 90 },
  semiannual: { label: 'نصف سنوية', per: 'كل 6 أشهر', months: 6, unit: 'أشهر', days: 180 },
  ninemonths: { label: '9 أشهر', per: 'كل 9 أشهر', months: 9, unit: 'أشهر', days: 270 },
  yearly: { label: 'سنوية', per: 'سنويًا', months: 12, unit: 'شهرًا', days: 365 },
};

export const PACKAGE_PERIODS = Object.keys(PERIOD_META) as PackagePeriod[];

/** The quarters of a year, for the 4-segment duration meter. */
export const QUARTERS = [1, 2, 3, 4] as const;

const DAYS_PER_MONTH = 365 / 12;
/** A served `durationDays` this close to a standard period counts as it (e.g. 360 → yearly). */
const PERIOD_TOLERANCE_DAYS = 6;

/** The standard period a day count stands for, or `null` for a custom length. */
export function periodOf(days: number): PackagePeriod | null {
  return PACKAGE_PERIODS.find((p) => Math.abs(PERIOD_META[p].days - days) <= PERIOD_TOLERANCE_DAYS) ?? null;
}

/** Display meta for any day count — standard periods by name, anything else as "N يوم". */
export function durationMeta(days: number): PeriodMeta {
  const period = periodOf(days);
  if (period) return PERIOD_META[period];
  const months = Math.max(1, Math.round(days / DAYS_PER_MONTH));
  return { label: `${days} يوم`, per: `كل ${days} يوم`, months, unit: months >= 3 && months <= 10 ? 'أشهر' : 'شهرًا', days };
}

// ─────────── catalog ───────────

export interface TechPackage {
  id: string;
  countryId: string;
  countryName: string;
  currency: string;
  name: string;
  description: string;
  durationDays: number;
  price: number;
  features: string[];
  /** Highlighted as "الأكثر اختيارًا" in the app. */
  featured: boolean;
  /** Offered for purchase in the app. */
  active: boolean;
}

export type PackageDraft = Omit<TechPackage, 'id' | 'countryName' | 'currency'>;

export function toDraft(p: TechPackage): PackageDraft {
  const { id: _id, countryName: _name, currency: _currency, ...draft } = p;
  return draft;
}

/** List filters (server-side); `null` = no constraint. */
export interface PackageFilter {
  name: string | null;
  countryId: string | null;
  active: boolean | null;
}

export type PackageCounts = Record<'all' | 'active' | 'inactive', number>;

export type PackageStatusFilter = 'all' | 'active' | 'inactive';

export const PACKAGE_STATUS_FILTER: Record<PackageStatusFilter, { label: string; active: boolean | null }> = {
  all: { label: 'الكل', active: null },
  active: { label: 'مفعّلة', active: true },
  inactive: { label: 'موقوفة', active: false },
};

// ─────────── subscription states (shared by the API model and the demo) ───────────

export type SubscriptionState = 'active' | 'expiring' | 'upcoming' | 'expired';

export const SUB_STATE_META: Record<SubscriptionState | 'none', { label: string; chip: string }> = {
  active: { label: 'سارية', chip: 'chip--green' },
  expiring: { label: 'تنتهي قريبًا', chip: 'chip--amber' },
  upcoming: { label: 'لم تبدأ بعد', chip: 'chip--blue' },
  expired: { label: 'منتهية', chip: 'chip--red' },
  none: { label: 'بدون باقة', chip: 'chip--slate' },
};

/** A valid subscription with ≤ this many days left counts as "expiring". */
export const EXPIRING_DAYS = 7;

// ─────────── demo subscriptions (dashboard / legacy people pages) ───────────

export interface Subscription {
  id: string;
  technicianId: string;
  packageId: string;
  countryId: string;
  /** Price paid at purchase time (packages can be repriced later). */
  price: number;
  startedAt: string;
  endsAt: string;
}

/** A technician's current package at a glance (the "الباقة الحالية" card). */
export interface SubscriptionSummary {
  sub: Subscription | undefined;
  pkg: TechPackage | undefined;
  state: SubscriptionState | 'none';
  /** Days remaining (never negative). */
  left: number;
  /** Share of the period remaining, 0–100. */
  pct: number;
  /** Every subscription, newest first. */
  history: Subscription[];
}
