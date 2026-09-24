import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { APP_LOCALE, formatRelative } from '../../../../shared/utils/format.util';
import { BOOKING_META } from '../../../people/people.config';
import { BookingsStore } from '../../bookings.store';
import { BookingsActionsService } from '../../bookings-actions.service';
import { BookingEvent } from '../../bookings.models';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';

const STEPS: { kind: BookingEvent['kind']; label: string; icon: IconName }[] = [
  { kind: 'created', label: 'تم الحجز', icon: 'calendar' },
  { kind: 'accepted', label: 'مؤكد', icon: 'check' },
  { kind: 'started', label: 'قيد التنفيذ', icon: 'activity' },
  { kind: 'completed', label: 'مكتمل', icon: 'check-circle' },
];

@Component({
  selector: 'app-booking-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, AvatarComponent, CountryFlagComponent, ...FORMAT_PIPES, ...COUNTRY_PIPES],
  templateUrl: './booking-detail.component.html',
  styleUrl: './booking-detail.component.scss',
})
export class BookingDetailComponent {
  readonly id = input.required<string>();

  private readonly store = inject(BookingsStore);
  private readonly router = inject(Router);
  protected readonly actions = inject(BookingsActionsService);

  protected readonly bookingMeta = BOOKING_META;
  protected readonly booking = computed(() => this.store.all().find((b) => b.id === this.id()));

  /** Stepper: each stage with the time it was reached (from the app's events). */
  protected readonly steps = computed(() => {
    const b = this.booking();
    const timeFmt = new Intl.DateTimeFormat(APP_LOCALE, { hour: 'numeric', minute: '2-digit' });
    return STEPS.map((s) => {
      const ev = b?.events.find((e) => e.kind === s.kind);
      return { ...s, done: !!ev, time: ev ? timeFmt.format(new Date(ev.date)) : '' };
    });
  });
  protected readonly stepIndex = computed(() => {
    const done = this.steps().filter((s) => s.done).length;
    return Math.max(0, done - 1);
  });
  protected readonly cancelled = computed(() => this.booking()?.status === 'cancelled');

  protected readonly timing = computed(() => {
    const b = this.booking();
    if (!b) return '';
    const at = (k: BookingEvent['kind']) => b.events.find((e) => e.kind === k)?.date;
    switch (b.status) {
      case 'scheduled': return `الفني قبل الطلب ${formatRelative(at('accepted') ?? b.date)} — بانتظار بدء الجلسة`;
      case 'in_progress': return `الجلسة جارية في منزل العميل — بدأت ${formatRelative(at('started') ?? b.date)}`;
      case 'completed': return `اكتملت الجلسة ${formatRelative(at('completed') ?? b.date)}`;
      case 'cancelled': return `تم إلغاء الحجز ${formatRelative(at('cancelled') ?? b.date)}`;
    }
  });

  protected async remove(): Promise<void> {
    const b = this.booking();
    if (b && (await this.actions.remove(b))) this.router.navigate(['/bookings']);
  }
}
