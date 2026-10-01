import { AccountLocationFilter, AccountRef, Gender, GeoPoint, PlaceRef } from './account-profile';
import { PlaceResolver } from './place-resolver.service';

/**
 * Wire → domain helpers shared by the accounts API boundaries
 * (`/admin/clients`, `/admin/specialists`).
 */

type Text = string | null | undefined;

export function toGender(raw: Text): Gender | null {
  switch (raw?.trim().toLowerCase()) {
    case 'male':
      return 'male';
    case 'female':
      return 'female';
    default:
      return null;
  }
}

/** First non-empty name wins — pass the Arabic name before the English one. */
export function toPlace(id: number | null | undefined, ...names: Text[]): PlaceRef | null {
  const name = names.map((n) => n?.trim()).find((n) => !!n) ?? '';
  const ref = id && id > 0 ? String(id) : null;
  return ref || name ? { id: ref, name } : null;
}

/** `null` for missing, out-of-range or `0,0` ("never set") coordinates. */
export function toGeoPoint(lat: number | null | undefined, lng: number | null | undefined): GeoPoint | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la === 0 && ln === 0) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return { lat: la, lng: ln };
}

export function locationParams(f: AccountLocationFilter): Record<string, unknown> {
  return { countryId: f.countryId, governorateId: f.countryId ? f.governorateId : null };
}

/**
 * Client + technician as bookings and reviews embed them. Places come by
 * name only for now (the governorate in English); the ids are optional so
 * they're picked up as soon as the backend sends them.
 */
export interface PartiesDto {
  clientId: number;
  clientName: string | null;
  clientCountryId?: number | null;
  clientCountryName: string | null;
  clientGovernorateId?: number | null;
  clientGovernorateName: string | null;
  specialistId: number;
  specialistName: string | null;
  specialistCountryId?: number | null;
  specialistCountryName: string | null;
  specialistGovernorateId?: number | null;
  specialistGovernorateName: string | null;
}

export function toParties(dto: PartiesDto, places: PlaceResolver): { client: AccountRef; specialist: AccountRef } {
  return {
    client: {
      id: String(dto.clientId),
      name: dto.clientName?.trim() || '—',
      place: places.resolve({
        countryId: dto.clientCountryId,
        countryName: dto.clientCountryName,
        governorateId: dto.clientGovernorateId,
        governorateName: dto.clientGovernorateName,
      }),
    },
    specialist: {
      id: String(dto.specialistId),
      name: dto.specialistName?.trim() || '—',
      place: places.resolve({
        countryId: dto.specialistCountryId,
        countryName: dto.specialistCountryName,
        governorateId: dto.specialistGovernorateId,
        governorateName: dto.specialistGovernorateName,
      }),
    },
  };
}
