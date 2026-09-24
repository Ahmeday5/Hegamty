/**
 * Service catalog. Categories (حجامة، مساج…) are shared across countries;
 * each service lives inside one category and is sold in one country at a
 * local price. Every session is a home visit, so there's no location option.
 */

export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
}

export type CategoryDraft = Pick<ServiceCategory, 'name' | 'description' | 'active'>;

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
