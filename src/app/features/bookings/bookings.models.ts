import { AccountLocationFilter, AccountRef } from '../accounts/account-profile';

/**
 * Bookings are placed by customers in the app and take place at the
 * customer's home (one of their saved addresses). The dashboard only
 * monitors them — the admin can neither confirm nor cancel a booking.
 * The price is paid to the technician directly, outside the platform.
 */

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export const BOOKING_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed', 'cancelled'];

export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; chip: string }> = {
  pending: { label: 'قيد التنفيذ', chip: 'chip--amber' },
  confirmed: { label: 'مؤكد', chip: 'chip--green' },
  cancelled: { label: 'ملغي', chip: 'chip--red' },
};

/** A catalog service in the booking, at the price agreed for it. */
export interface BookingItem {
  serviceId: string;
  name: string;
  price: number;
}

export type PaymentMethod = 'cash' | 'other';

export interface Booking {
  id: string;
  client: AccountRef;
  specialist: AccountRef;
  /** One of the client's saved addresses (`/admin/clients/{id}/addresses`). */
  addressId: string | null;
  /** ISO date of the session. The time of day isn't served yet — show the date only. */
  date: string | null;
  status: BookingStatus;
  items: BookingItem[];
  /** In the client's country's currency. */
  totalPrice: number;
  paymentMethod: PaymentMethod;
  /** As sent, for methods the dashboard doesn't know yet. */
  paymentLabel: string;
  notes: string;
}

export const PAYMENT_META: Record<PaymentMethod, { label: string }> = {
  cash: { label: 'نقدًا' },
  other: { label: 'أخرى' },
};

/** Server-side filters of `/admin/bookings`; `null` = no constraint. */
export interface BookingQuery {
  clientId: string | null;
  specialistId: string | null;
  /** The client's residence (sessions happen at the client's home). */
  clientLocation: AccountLocationFilter;
  /** The technician's work area. */
  specialistLocation: AccountLocationFilter;
}

/** List filters: the server query plus the status, applied in the browser (the API has no status filter). */
export interface BookingFilter extends BookingQuery {
  status: BookingStatus | null;
}

export type BookingCounts = Record<BookingStatus | 'all', number> & {
  /** Sum of non-cancelled bookings — only meaningful within one country (one currency). */
  value: number;
};

export function countBookings(rows: readonly Booking[]): BookingCounts {
  const counts: BookingCounts = { all: rows.length, pending: 0, confirmed: 0, cancelled: 0, value: 0 };
  for (const b of rows) {
    counts[b.status]++;
    if (b.status !== 'cancelled') counts.value += b.totalPrice;
  }
  return counts;
}

/** "حجامة رطبة" · "حجامة رطبة +2". */
export function itemsSummary(b: Pick<Booking, 'items'>): string {
  const [first, ...rest] = b.items;
  if (!first) return '—';
  return rest.length ? `${first.name} +${rest.length}` : first.name;
}
