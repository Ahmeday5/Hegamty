/**
 * Drivers (`/admin/drivers`). Accounts are created from the driver app; the
 * dashboard reviews them and can ban / lift a ban — there's no edit or
 * delete. `active` and `available` are owned by the backend.
 *
 * Not served yet (rendered as "قيد التطوير"): country / governorate, trips,
 * ratings and notifications.
 */

export interface DriverVehicle {
  model: string;
  /** As entered in the app — usually an English colour name ("grey"). */
  color: string;
  type: string;
  plate: string;
}

export interface Driver {
  id: string;
  fullName: string;
  phone: string;
  nationalIdNumber: string;
  vehicle: DriverVehicle;
  /** Absolute URL, or `null` when not uploaded. */
  photoUrl: string | null;
  active: boolean;
  /** Online and accepting trips right now. */
  available: boolean;
  banned: boolean;
  /** ISO timestamp, or `null` when the server sent none. */
  createdAt: string | null;
}

// ─────────── list filters ───────────

/** Server-side filters; `null` = no constraint. */
export interface DriverFilter {
  name: string | null;
  phone: string | null;
  active: boolean | null;
  banned: boolean | null;
}

export const NO_DRIVER_FILTER: DriverFilter = { name: null, phone: null, active: null, banned: null };

export interface DriverCounts {
  all: number;
  active: number;
  inactive: number;
  banned: number;
}

// ─────────── display meta ───────────

export type DriverActivity = 'active' | 'inactive';
export const DRIVER_ACTIVITIES: readonly DriverActivity[] = ['active', 'inactive'];

export const DRIVER_ACTIVITY_META: Record<DriverActivity, { label: string; chip: string }> = {
  active: { label: 'نشط', chip: 'chip--green' },
  inactive: { label: 'غير نشط', chip: 'chip--slate' },
};

export const activityOf = (d: Pick<Driver, 'active'>): DriverActivity => (d.active ? 'active' : 'inactive');

export type DriverAvailability = 'available' | 'offline';

export const DRIVER_AVAILABILITY_META: Record<DriverAvailability, { label: string; chip: string }> = {
  available: { label: 'متاح للرحلات', chip: 'chip--blue' },
  offline: { label: 'غير متاح', chip: 'chip--slate' },
};

export const availabilityOf = (d: Pick<Driver, 'available'>): DriverAvailability => (d.available ? 'available' : 'offline');

/** Accounts registered in the last N days get a "جديد" badge. */
const NEW_DRIVER_DAYS = 10;

export function isNewDriver(d: Pick<Driver, 'createdAt'>, now = Date.now()): boolean {
  return !!d.createdAt && now - +new Date(d.createdAt) < NEW_DRIVER_DAYS * 86_400_000;
}

// ─────────── vehicle colour ───────────

const COLOR_NAMES_AR: Record<string, string> = {
  white: 'أبيض',
  black: 'أسود',
  grey: 'رمادي',
  gray: 'رمادي',
  silver: 'فضي',
  red: 'أحمر',
  blue: 'أزرق',
  navy: 'كحلي',
  green: 'أخضر',
  yellow: 'أصفر',
  orange: 'برتقالي',
  brown: 'بني',
  beige: 'بيج',
  gold: 'ذهبي',
  maroon: 'نبيتي',
};

/** "grey" → "رمادي"; anything unknown is shown as entered. */
export function vehicleColorLabel(color: string): string {
  return COLOR_NAMES_AR[color.trim().toLowerCase()] ?? color;
}

/** Swatch colour for a known name, else `null` (no swatch for free text). */
export function vehicleColorSwatch(color: string): string | null {
  const key = color.trim().toLowerCase();
  return key in COLOR_NAMES_AR ? key : null;
}

/** "Toyota Corolla · أبيض" — one line for tables. */
export function vehicleSummary(v: DriverVehicle): string {
  return [v.model, v.color && vehicleColorLabel(v.color)].filter(Boolean).join(' · ') || '—';
}
