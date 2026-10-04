import { formatSpan } from '../../shared/utils/format.util';
import { AccountLocationFilter, AccountRef } from '../accounts/account-profile';
import { OPEN_DURATION_LABEL } from '../services/service-catalog.models';

/**
 * Bookings are placed by customers in the app and take place at the
 * customer's home (one of their saved addresses). The dashboard only
 * monitors them — the admin can neither confirm nor cancel a booking.
 * The price is paid to the technician directly, outside the platform.
 */

/** Lifecycle: pending → confirmed → completed, or cancelled along the way. */
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export const BOOKING_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; plural: string; chip: string; color: string }> = {
  pending: { label: 'بانتظار التأكيد', plural: 'بانتظار التأكيد', chip: 'chip--amber', color: 'var(--am)' },
  confirmed: { label: 'مؤكد', plural: 'مؤكدة', chip: 'chip--blue', color: 'var(--sk)' },
  completed: { label: 'مكتمل', plural: 'مكتملة', chip: 'chip--green', color: 'var(--gr)' },
  cancelled: { label: 'ملغي', plural: 'ملغاة', chip: 'chip--red', color: 'var(--re)' },
};

/** Totals per status — served by `/{clients|specialists}/{id}/bookings/stats`, or counted from a list. */
export type BookingStats = Record<BookingStatus | 'all', number>;

/** A catalog service in the booking, at the price and length agreed for it. */
export interface BookingItem {
  serviceId: string;
  name: string;
  price: number;
  /** Session length in minutes; `null` = open-ended (no fixed duration). */
  durationMin: number | null;
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
  /** Derived from `items`. */
  duration: BookingDuration;
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

export type BookingCounts = BookingStats & {
  /** Sum of non-cancelled bookings — only meaningful within one country (one currency). */
  value: number;
};

export function countBookings(rows: readonly Booking[]): BookingCounts {
  const counts: BookingCounts = { all: rows.length, pending: 0, confirmed: 0, completed: 0, cancelled: 0, value: 0 };
  for (const b of rows) {
    counts[b.status]++;
    if (b.status !== 'cancelled') counts.value += b.totalPrice;
  }
  return counts;
}

/**
 * How long a booking runs: the timed items summed, and how many items have
 * no fixed length — those make the real end time unknown.
 */
export interface BookingDuration {
  minutes: number;
  openItems: number;
}

export function bookingDuration(items: readonly BookingItem[]): BookingDuration {
  let minutes = 0;
  let openItems = 0;
  for (const i of items) {
    if (i.durationMin === null) openItems++;
    else minutes += i.durationMin;
  }
  return { minutes, openItems };
}

/** "ساعة واحدة و30 دقيقة" · "45 دقيقة + مدة مفتوحة" · "مدة مفتوحة" · "—" (no items). */
export function formatBookingDuration(d: BookingDuration): string {
  if (!d.minutes) return d.openItems ? OPEN_DURATION_LABEL : '—';
  return d.openItems ? `${formatSpan(d.minutes)} + ${OPEN_DURATION_LABEL}` : formatSpan(d.minutes);
}

/** "حجامة رطبة" · "حجامة رطبة +2". */
export function itemsSummary(b: Pick<Booking, 'items'>): string {
  const [first, ...rest] = b.items;
  if (!first) return '—';
  return rest.length ? `${first.name} +${rest.length}` : first.name;
}
