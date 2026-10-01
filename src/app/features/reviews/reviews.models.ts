import { AccountLocationFilter, AccountPlace, AccountRef } from '../accounts/account-profile';

/** A customer's rating (1–5) and comment on a technician, left after a booking. */
export interface Review {
  id: string;
  bookingId: string | null;
  client: AccountRef;
  specialist: AccountRef;
  rating: Stars;
  comment: string;
  /** ISO timestamp, or `null` when the server sent none. */
  createdAt: string | null;
}

export type Stars = 1 | 2 | 3 | 4 | 5;

export const STAR_VALUES: readonly Stars[] = [5, 4, 3, 2, 1];

export const RATING_LABELS: Record<Stars, string> = {
  5: 'ممتاز',
  4: 'جيد جدًا',
  3: 'جيد',
  2: 'مقبول',
  1: 'سيئ',
};

/** Server-side filters of `/admin/reviews`; `null` = no constraint. */
export interface ReviewQuery {
  clientId: string | null;
  specialistId: string | null;
}

/**
 * List filters. The rating and the parties' locations are applied in the
 * browser — the API filters by account only.
 */
export interface ReviewFilter extends ReviewQuery {
  rating: Stars | null;
  clientLocation: AccountLocationFilter;
  specialistLocation: AccountLocationFilter;
}

export interface RatingSummary {
  count: number;
  /** `0` when there are no reviews. */
  average: number;
  /** 5 → 1 stars. */
  breakdown: { stars: Stars; count: number; pct: number }[];
}

export function summarizeRatings(rows: readonly Review[]): RatingSummary {
  const counts: Record<Stars, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of rows) {
    counts[r.rating]++;
    sum += r.rating;
  }
  const count = rows.length;
  return {
    count,
    average: count ? Math.round((sum / count) * 10) / 10 : 0,
    breakdown: STAR_VALUES.map((stars) => ({ stars, count: counts[stars], pct: count ? Math.round((counts[stars] / count) * 100) : 0 })),
  };
}

function placeMatches(place: AccountPlace, loc: AccountLocationFilter): boolean {
  if (loc.countryId && place.country?.id !== loc.countryId) return false;
  if (loc.governorateId && place.governorate?.id !== loc.governorateId) return false;
  return true;
}

export function matchesLocations(r: Review, f: Pick<ReviewFilter, 'clientLocation' | 'specialistLocation'>): boolean {
  return placeMatches(r.client.place, f.clientLocation) && placeMatches(r.specialist.place, f.specialistLocation);
}
