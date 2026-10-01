import { Injectable, Signal, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ToastService } from '../../core/services/toast.service';
import { ApiError } from '../../core/models/api-response.model';
import { apiErrorToMessage } from '../../core/utils/api-error.util';
import { BookingsApi } from './bookings.api';
import { Booking } from './bookings.models';

/**
 * The app-wide booking sheet (rendered once, by the main layout). Lists open
 * the booking they hold; references elsewhere (e.g. a review's booking
 * number) open it by id — looked up on demand, then remembered.
 */
@Injectable({ providedIn: 'root' })
export class BookingSheetService {
  private readonly api = inject(BookingsApi);
  private readonly toast = inject(ToastService);
  private readonly known = new Map<string, Booking>();
  private pending: Subscription | null = null;

  private readonly shown = signal<Booking | null>(null);
  private readonly loading = signal<string | null>(null);

  /** The booking on screen; `null` = closed. */
  readonly current: Signal<Booking | null> = this.shown.asReadonly();
  /** Id being looked up for `openById`, to show progress on the trigger. */
  readonly loadingId: Signal<string | null> = this.loading.asReadonly();

  open(booking: Booking): void {
    this.cancelPending();
    this.known.set(booking.id, booking);
    this.shown.set(booking);
  }

  openById(id: string, parties: { clientId: string | null; specialistId: string | null }): void {
    const cached = this.known.get(id);
    if (cached) return this.open(cached);
    if (this.loading() === id) return;

    this.cancelPending();
    this.loading.set(id);
    this.pending = this.api.find(id, parties).subscribe({
      next: (booking) => {
        this.loading.set(null);
        if (booking) this.open(booking);
        else this.toast.warning(`الحجز #${id} لم يعد متاحًا — ربما حُذف.`);
      },
      error: (err: ApiError) => {
        this.loading.set(null);
        this.toast.error(apiErrorToMessage(err, 'تعذّر فتح الحجز، حاول مرة أخرى.'), { title: `الحجز #${id}` });
      },
    });
  }

  close(): void {
    this.shown.set(null);
  }

  private cancelPending(): void {
    this.pending?.unsubscribe();
    this.pending = null;
    this.loading.set(null);
  }
}
