/**
 * Technician subscription packages — the platform's only revenue. A
 * technician buys a package in their country's currency; while it's valid
 * the app lets them receive bookings. Customers pay technicians directly,
 * drivers are paid by technicians in cash; neither goes through the app.
 */

export type PackagePeriod = 'monthly' | 'quarterly' | 'yearly';

export const PERIOD_META: Record<PackagePeriod, { label: string; per: string; days: number }> = {
  monthly: { label: 'شهرية', per: 'شهريًا', days: 30 },
  quarterly: { label: 'ربع سنوية', per: 'كل 3 أشهر', days: 90 },
  yearly: { label: 'سنوية', per: 'سنويًا', days: 365 },
};

export interface TechPackage {
  id: string;
  countryId: string;
  name: string;
  description: string;
  period: PackagePeriod;
  price: number;
  features: string[];
  /** Highlighted as "الأكثر اختيارًا" in the app. */
  featured: boolean;
  active: boolean;
  createdAt: string;
}

export type PackageDraft = Omit<TechPackage, 'id' | 'createdAt'>;

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

export type SubscriptionState = 'active' | 'expiring' | 'expired';

export const SUB_STATE_META: Record<SubscriptionState | 'none', { label: string; chip: string }> = {
  active: { label: 'سارية', chip: 'chip--green' },
  expiring: { label: 'تنتهي قريبًا', chip: 'chip--amber' },
  expired: { label: 'منتهية', chip: 'chip--red' },
  none: { label: 'بدون باقة', chip: 'chip--slate' },
};

/** A valid subscription with ≤ this many days left counts as "expiring". */
export const EXPIRING_DAYS = 7;
