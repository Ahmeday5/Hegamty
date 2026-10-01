import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { asPaged, fetchAllPages } from '../../core/utils/api-list.util';
import { parseApiDate } from '../../core/utils/api-date.util';
import { Page, PageRequest, toPageMeta } from '../../core/models/page.model';
import { PartiesDto, toParties } from '../accounts/account-wire';
import { PlaceResolver } from '../accounts/place-resolver.service';
import { Booking, BookingItem, BookingQuery, BookingStatus } from './bookings.models';

// ─────────── wire format ───────────

interface BookingItemDto {
  serviceId: number;
  name: string | null;
  price: number | null;
}

interface BookingDto extends PartiesDto {
  id: number;
  addressId: number | null;
  bookingDate: string | null;
  status: string | null;
  totalPrice: number | null;
  paymentMethod: string | null;
  notes: string | null;
  items: BookingItemDto[] | null;
}

const ENDPOINT = 'admin/bookings';

const STATUS_FROM_WIRE: Record<string, BookingStatus> = {
  pending: 'pending',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

// ─────────── mapping ───────────

function toItem(dto: BookingItemDto): BookingItem {
  return { serviceId: String(dto.serviceId), name: dto.name?.trim() || '—', price: Number(dto.price) || 0 };
}

function toParams(q: BookingQuery, page: PageRequest): Record<string, unknown> {
  return {
    PageIndex: page.pageIndex,
    PageSize: page.pageSize,
    clientId: q.clientId,
    specialistId: q.specialistId,
    clientCountryId: q.clientLocation.countryId,
    clientGovernorateId: q.clientLocation.countryId ? q.clientLocation.governorateId : null,
    specialistCountryId: q.specialistLocation.countryId,
    specialistGovernorateId: q.specialistLocation.countryId ? q.specialistLocation.governorateId : null,
  };
}

/**
 * HTTP boundary for bookings (read-only — bookings originate in the app).
 * Reads are silent: the calling page renders its own loading / error states.
 */
@Injectable({ providedIn: 'root' })
export class BookingsApi {
  private readonly api = inject(ApiService);
  private readonly places = inject(PlaceResolver);

  list(query: BookingQuery, page: PageRequest): Observable<Page<Booking>> {
    return this.getPage(ENDPOINT, toParams(query, page)).pipe(
      map((paged) => ({ items: paged.data.map((d) => this.toBooking(d)), page: toPageMeta(paged, page) })),
    );
  }

  /** Every page for the filters, drained (status filtering, totals, exports). */
  listAll(query: BookingQuery): Observable<Booking[]> {
    return this.drain(ENDPOINT, (page) => toParams(query, page));
  }

  /**
   * One booking by id. There's no single-booking endpoint, so the booking is
   * looked up among its parties' bookings — pass both ids to keep that list short.
   * Emits `null` when it isn't there (deleted, or the hint was wrong).
   */
  find(id: string, parties: { clientId: string | null; specialistId: string | null }): Observable<Booking | null> {
    const none = { countryId: null, governorateId: null };
    return this.listAll({ ...parties, clientLocation: none, specialistLocation: none }).pipe(
      map((list) => list.find((b) => b.id === id) ?? null),
    );
  }

  /** All bookings of one technician. */
  ofSpecialist(id: string): Observable<Booking[]> {
    return this.drain(`admin/specialists/${id}/bookings`, (page) => ({ PageIndex: page.pageIndex, PageSize: page.pageSize }));
  }

  /** All bookings of one customer. */
  ofClient(id: string): Observable<Booking[]> {
    return this.drain(`admin/clients/${id}/bookings`, (page) => ({ PageIndex: page.pageIndex, PageSize: page.pageSize }));
  }

  private getPage(url: string, params: Record<string, unknown>) {
    return this.api.get<unknown>(url, { params, context: withInlineHandling() }).pipe(map((res) => asPaged<BookingDto>(res)));
  }

  private drain(url: string, params: (page: PageRequest) => Record<string, unknown>): Observable<Booking[]> {
    return fetchAllPages((pageIndex, pageSize) => this.getPage(url, params({ pageIndex, pageSize }))).pipe(
      map((list) => list.map((d) => this.toBooking(d))),
    );
  }

  private toBooking(dto: BookingDto): Booking {
    const method = dto.paymentMethod?.trim() ?? '';
    const items = (dto.items ?? []).map(toItem);
    const total = dto.totalPrice === null || dto.totalPrice === undefined ? NaN : Number(dto.totalPrice);
    return {
      id: String(dto.id),
      ...toParties(dto, this.places),
      addressId: dto.addressId && dto.addressId > 0 ? String(dto.addressId) : null,
      date: parseApiDate(dto.bookingDate),
      status: STATUS_FROM_WIRE[dto.status?.trim().toLowerCase() ?? ''] ?? 'pending',
      items,
      totalPrice: Number.isFinite(total) ? total : items.reduce((sum, i) => sum + i.price, 0),
      paymentMethod: method.toLowerCase() === 'cash' ? 'cash' : 'other',
      paymentLabel: method,
      notes: dto.notes?.trim() ?? '',
    };
  }
}
