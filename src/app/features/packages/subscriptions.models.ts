/**
 * Technician package subscriptions (`/admin/specialists/subscriptions`) —
 * every package purchase a technician made from the app. Read-only here:
 * purchases happen in the app. The package name and price are captured at
 * purchase time, so later edits to the package don't rewrite history.
 */
import { EXPIRING_DAYS, SubscriptionState } from './packages.models';

const DAY_MS = 86_400_000;

export interface SpecialistSubscription {
  id: string;
  specialistId: string;
  specialistName: string;
  specialistPhone: string;
  countryId: string;
  countryName: string;
  packageId: string;
  packageName: string;
  /** Paid at purchase, in `currency`. */
  price: number;
  currency: string;
  /** ISO; `null` when the server sent none. */
  startedAt: string | null;
  endsAt: string | null;
  /** Server flag — the subscription is in force (not expired / cancelled). */
  active: boolean;
}

// ─────────── list filters ───────────

/** Server-side filters; `null` = no constraint. */
export interface SubscriptionFilter {
  /** Technician name. */
  name: string | null;
  countryId: string | null;
  active: boolean | null;
}

export type SubscriptionStatusFilter = 'all' | 'active' | 'inactive';

export const SUBSCRIPTION_STATUS_FILTER: Record<SubscriptionStatusFilter, { label: string; active: boolean | null }> = {
  all: { label: 'الكل', active: null },
  active: { label: 'سارية', active: true },
  inactive: { label: 'منتهية', active: false },
};

export const SUBSCRIPTION_STATUS_TABS = Object.keys(SUBSCRIPTION_STATUS_FILTER) as SubscriptionStatusFilter[];

export type SubscriptionCounts = Record<SubscriptionStatusFilter, number>;

// ─────────── timeline ───────────

/** Where a subscription stands today — drives the chip and the remaining-time bar. */
export interface SubscriptionTimeline {
  state: SubscriptionState;
  /** Whole days until it ends (never negative). */
  daysLeft: number;
  /** Share of the period still remaining, 0–100. */
  remainingPct: number;
  /** Length of the subscribed period in days (0 when the dates are missing). */
  totalDays: number;
}

/**
 * The server's `active` flag wins (an inactive subscription is over, whatever
 * its dates say); dates then tell an upcoming or nearly-over one apart.
 */
export function subscriptionTimeline(s: SpecialistSubscription, now = Date.now()): SubscriptionTimeline {
  const start = s.startedAt ? Date.parse(s.startedAt) : NaN;
  const end = s.endsAt ? Date.parse(s.endsAt) : NaN;
  const daysLeft = Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / DAY_MS)) : 0;
  const span = end - start;
  const totalDays = span > 0 ? Math.round(span / DAY_MS) : 0;
  const remainingPct = span > 0 ? Math.round(Math.min(1, Math.max(0, (end - now) / span)) * 100) : 0;

  let state: SubscriptionState;
  if (!s.active || (Number.isFinite(end) && end <= now)) state = 'expired';
  else if (Number.isFinite(start) && start > now) state = 'upcoming';
  else if (daysLeft <= EXPIRING_DAYS) state = 'expiring';
  else state = 'active';

  const over = state === 'expired';
  return { state, daysLeft: over ? 0 : daysLeft, remainingPct: over ? 0 : remainingPct, totalDays };
}

/**
 * The subscription a technician is working under now: the running one that
 * lasts longest, else the next upcoming one, else the most recently ended
 * (so the card can say it's over); `null` if they never subscribed.
 */
export function currentSubscription(list: readonly SpecialistSubscription[], now = Date.now()): SpecialistSubscription | null {
  const endOf = (s: SpecialistSubscription) => (s.endsAt ? Date.parse(s.endsAt) : 0);
  const startOf = (s: SpecialistSubscription) => (s.startedAt ? Date.parse(s.startedAt) : 0);
  const stateOf = (s: SpecialistSubscription) => subscriptionTimeline(s, now).state;
  const byLatestEnd = [...list].sort((a, b) => endOf(b) - endOf(a));
  const nextUpcoming = list.filter((s) => stateOf(s) === 'upcoming').sort((a, b) => startOf(a) - startOf(b))[0];
  return byLatestEnd.find((s) => stateOf(s) === 'active' || stateOf(s) === 'expiring') ?? nextUpcoming ?? byLatestEnd[0] ?? null;
}
