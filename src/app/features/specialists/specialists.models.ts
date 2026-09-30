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

export interface Specialist {
  id: string;
  fullName: string;
  phone: string;
  age: number | null;
  experienceYears: number;
  description: string;
  status: SpecialistStatus;
  banned: boolean;
  /** Absolute URLs (or `null` when not uploaded). */
  photoUrl: string | null;
  documents: SpecialistDocuments;
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

/** List filters; `null` = no constraint. */
export interface SpecialistFilter {
  name: string | null;
  phone: string | null;
  status: SpecialistStatus | null;
  /**
   * Applied in the browser — the API has no ban filter yet (see `SpecialistsStore`).
   * `true` = banned only, `false` = not banned only.
   */
  banned: boolean | null;
}

export const NO_SPECIALIST_FILTER: SpecialistFilter = { name: null, phone: null, status: null, banned: null };

export type SpecialistCounts = Record<SpecialistStatus | 'all', number>;

export const SPECIALIST_STATUSES: readonly SpecialistStatus[] = ['pending', 'approved', 'rejected'];

export const SPECIALIST_STATUS_META: Record<SpecialistStatus, { label: string; chip: string }> = {
  pending: { label: 'بانتظار المراجعة', chip: 'chip--amber' },
  approved: { label: 'معتمد', chip: 'chip--green' },
  rejected: { label: 'مرفوض', chip: 'chip--red' },
};
