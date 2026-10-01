import { AccountLocationFilter, AccountPlace, Gender, GeoPoint, PlaceRef } from '../accounts/account-profile';

/**
 * Customers — "clients" in the backend (`/admin/clients`). Accounts are
 * created from the mobile app; the dashboard reviews them and can ban /
 * lift a ban. `active` is owned by the backend (not editable here).
 */

export interface Client {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  gender: Gender | null;
  age: number | null;
  /** Free-text address entered at registration. */
  address: string;
  active: boolean;
  banned: boolean;
  /** Country and governorate the customer lives in. */
  residence: AccountPlace;
  nationality: PlaceRef | null;
  /** Position captured at registration. */
  position: GeoPoint | null;
  /** Absolute URLs, or `null` when not uploaded. */
  photoUrl: string | null;
  nationalIdUrl: string | null;
  /** ISO timestamp, or `null` when the server sent none. */
  createdAt: string | null;
}

/** A delivery address saved by the customer in the app (home, work …). */
export interface ClientAddress {
  id: string;
  /** Customer-chosen name, e.g. "المنزل". */
  label: string;
  /** Contact number for visits to this address (may differ from the account's). */
  phone: string;
  text: string;
  notes: string;
  position: GeoPoint | null;
}

/** List filters; `null` = no constraint. The location is the customer's residence. */
export interface ClientFilter extends AccountLocationFilter {
  name: string | null;
  phone: string | null;
  active: boolean | null;
  /**
   * Applied in the browser — the API has no ban filter yet (see `ClientsStore`).
   * `true` = banned only, `false` = not banned only.
   */
  banned: boolean | null;
}

export const NO_CLIENT_FILTER: ClientFilter = {
  name: null,
  phone: null,
  active: null,
  banned: null,
  countryId: null,
  governorateId: null,
};

export interface ClientCounts {
  all: number;
  active: number;
  inactive: number;
}

export type ClientActivity = 'active' | 'inactive';

export const CLIENT_ACTIVITY_META: Record<ClientActivity, { label: string; chip: string }> = {
  active: { label: 'نشط', chip: 'chip--green' },
  inactive: { label: 'غير نشط', chip: 'chip--slate' },
};

export const activityOf = (c: Pick<Client, 'active'>): ClientActivity => (c.active ? 'active' : 'inactive');

/** Accounts registered in the last N days get a "جديد" badge. */
const NEW_CLIENT_DAYS = 10;

export function isNewClient(c: Pick<Client, 'createdAt'>, now = Date.now()): boolean {
  return !!c.createdAt && now - +new Date(c.createdAt) < NEW_CLIENT_DAYS * 86400000;
}
