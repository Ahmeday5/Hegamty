/**
 * Service catalog. Sections / categories (حجامة، مساج…) are shared across countries;
 * each service lives inside one category and is sold in one country at a
 * local price. Every session is a home visit, so there's no location option.
 */

/** A country a section is offered in (as embedded in a section). */
export interface SectionCountry {
  id: string;
  name: string;
  nameEn: string;
}

/** A services section (`/admin/sections`) — shown to customers as a browsing group in the app. */
export interface ServiceCategory {
  /** Backend id, kept as a string like every other entity id. */
  id: string;
  name: string;
  description: string;
  /** Absolute URL of the uploaded icon image; `null` if none (or a legacy placeholder). */
  iconUrl: string | null;
  active: boolean;
  /** Countries where the app shows this section, sorted by Arabic name. */
  countries: SectionCountry[];
}

/** Section write payload (sent as `multipart/form-data`). */
export interface CategoryDraft {
  name: string;
  description: string;
  active: boolean;
  countryIds: string[];
  /** A new icon image. Omitted on update → the server keeps the current one. */
  iconFile?: File | null;
}

export interface ClinicService {
  id: string;
  countryId: string;
  categoryId: string;
  name: string;
  description: string;
  /** Session price in the country's currency (paid to the technician directly). */
  price: number;
  /** `null` = open-ended service without a fixed duration. */
  durationMin: number | null;
  active: boolean;
  bookingsCount: number;
  rating: number;
  createdAt: string;
}

export type ServiceDraft = Pick<ClinicService, 'countryId' | 'categoryId' | 'name' | 'description' | 'price' | 'durationMin' | 'active'>;
