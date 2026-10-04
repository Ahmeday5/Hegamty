import { Pipe, PipeTransform } from '@angular/core';
import { BookingDuration, formatBookingDuration } from './bookings.models';

/** `{{ b.duration | bookingDuration }}` — "ساعة واحدة و30 دقيقة" · "45 دقيقة + مدة مفتوحة". */
@Pipe({ name: 'bookingDuration', standalone: true })
export class BookingDurationPipe implements PipeTransform {
  transform(value: BookingDuration | null | undefined): string {
    return value ? formatBookingDuration(value) : '—';
  }
}

export const BOOKING_PIPES = [BookingDurationPipe] as const;
