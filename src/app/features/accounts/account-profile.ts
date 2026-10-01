/**
 * Profile fields shared by the accounts endpoints (customers, technicians):
 * gender, where the account lives / works, nationality and GPS position.
 */

export type Gender = 'male' | 'female';

export const GENDER_META: Record<Gender, { label: string }> = {
  male: { label: 'ذكر' },
  female: { label: 'أنثى' },
};

/** A country or governorate as the accounts endpoints reference it. */
export interface PlaceRef {
  /** `null` when the server sent a name without an id. */
  id: string | null;
  /** Arabic name when available, English otherwise. */
  name: string;
}

/** Country + governorate an account is bound to (residence for customers, work area for technicians). */
export interface AccountPlace {
  country: PlaceRef | null;
  governorate: PlaceRef | null;
}

/** An account as other records (bookings, reviews) reference it. */
export interface AccountRef {
  id: string;
  name: string;
  place: AccountPlace;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Server-side location filter of the accounts lists; `null` = no constraint. */
export interface AccountLocationFilter {
  countryId: string | null;
  governorateId: string | null;
}

export const ANY_LOCATION: AccountLocationFilter = { countryId: null, governorateId: null };

export const locationKey = (f: AccountLocationFilter): string => `${f.countryId ?? ''}|${f.governorateId ?? ''}`;

export function mapsUrl(p: GeoPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}

export function formatGeoPoint(p: GeoPoint): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}
