import { AccountLocationFilter, AccountPlace, Gender, GeoPoint, PlaceRef } from '../accounts/account-profile';

/**
 * Technicians — "specialists" in the backend (`/admin/specialists`). They
 * self-register from the mobile app with their identity documents and start
 * `pending`; the admin approves or rejects them. Banning is independent of
 * the review outcome.
 */

export type SpecialistStatus = 'pending' | 'approved' | 'rejected';

export interface SpecialistDocuments {
  idFront: string | null;
  idBack: string | null;
  /** Selfie holding the ID card. */
  idWithPerson: string | null;
}

/** Aggregate of the technician's reviews, as served with the profile. */
export interface SpecialistRating {
  /** 0–5, one decimal; `0` when there are no reviews. */
  average: number;
  count: number;
}

export interface Specialist {
  id: string;
  fullName: string;
  phone: string;
  gender: Gender | null;
  age: number | null;
  /** ISO timestamp, or `null` when not set. */
  birthDate: string | null;
  experienceYears: number;
  description: string;
  status: SpecialistStatus;
  banned: boolean;
  /** Toggled by the technician in the app: currently accepting requests. */
  available: boolean;
  /** `null` when the endpoint didn't include it. */
  rating: SpecialistRating | null;
  /** Country and governorate the technician works in. */
  workPlace: AccountPlace;
  nationality: PlaceRef | null;
  /** Last position reported by the app. */
  position: GeoPoint | null;
  /** Absolute URLs (or `null` when not uploaded). */
  photoUrl: string | null;
  documents: SpecialistDocuments;
  /** ISO timestamps, or `null` when the server sent none. */
  createdAt: string | null;
  updatedAt: string | null;
}

/** A catalog service the technician offers, at their own price within the allowed range. */
export interface SpecialistService {
  id: string;
  pricingId: string;
  name: string;
  sectionName: string;
  countryName: string;
  currency: string;
  price: number;
  priceMin: number;
  priceMax: number;
  /** `null` = open-ended session. */
  durationMin: number | null;
  description: string;
}

/** List filters; `null` = no constraint. The location is the technician's work area. */
export interface SpecialistFilter extends AccountLocationFilter {
  name: string | null;
  phone: string | null;
  status: SpecialistStatus | null;
  /**
   * Applied in the browser — the API has no ban filter yet (see `SpecialistsStore`).
   * `true` = banned only, `false` = not banned only.
   */
  banned: boolean | null;
}

export const NO_SPECIALIST_FILTER: SpecialistFilter = {
  name: null,
  phone: null,
  status: null,
  banned: null,
  countryId: null,
  governorateId: null,
};

export type SpecialistCounts = Record<SpecialistStatus | 'all', number>;

export const SPECIALIST_STATUSES: readonly SpecialistStatus[] = ['pending', 'approved', 'rejected'];

export const SPECIALIST_STATUS_META: Record<SpecialistStatus, { label: string; chip: string }> = {
  pending: { label: 'بانتظار المراجعة', chip: 'chip--amber' },
  approved: { label: 'معتمد', chip: 'chip--green' },
  rejected: { label: 'مرفوض', chip: 'chip--red' },
};

export const AVAILABILITY_META: Record<'on' | 'off', { label: string; chip: string }> = {
  on: { label: 'متاح للطلبات', chip: 'chip--green' },
  off: { label: 'غير متاح', chip: 'chip--slate' },
};

export const availabilityOf = (s: Pick<Specialist, 'available'>): 'on' | 'off' => (s.available ? 'on' : 'off');
