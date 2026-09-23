import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { APP_LOCALE, formatRelative } from '../../../../shared/utils/format.util';
import { ToastService } from '../../../../core/services/toast.service';
import { BOOKING_META } from '../../../people/people.config';
import { BookingFormComponent } from '../../components/booking-form/booking-form.component';
import { BookingsStore } from '../../bookings.store';
import { BookingsActionsService } from '../../bookings-actions.service';
import { BookingEvent, LOCATION_META, PAYMENT_META } from '../../bookings.models';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';

const EVENT_META: Record<BookingEvent['kind'], { icon: IconName; tone: string }> = {
  created: { icon: 'plus', tone: 'blue' },
  confirmed: { icon: 'check', tone: 'teal' },
  assigned: { icon: 'user', tone: 'purple' },
  started: { icon: 'activity', tone: 'amber' },
  completed: { icon: 'check-circle', tone: 'green' },
  cancelled: { icon: 'ban', tone: 'red' },
  payment: { icon: 'card', tone: 'green' },
  updated: { icon: 'edit', tone: 'blue' },
};

const STEPS = [
  { label: 'تم الحجز', icon: 'calendar' as IconName },
  { label: 'مؤكد', icon: 'check' as IconName },
  { label: 'قيد التنفيذ', icon: 'activity' as IconName },
  { label: 'مكتمل', icon: 'check-circle' as IconName },
];

@Component({
  selector: 'app-booking-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, AvatarComponent, BookingFormComponent, CountryFlagComponent, ...FORMAT_PIPES, ...COUNTRY_PIPES],
  templateUrl: './booking-detail.component.html',
  styleUrl: './booking-detail.component.scss',
})
export class BookingDetailComponent {
  readonly id = input.required<string>();

  private readonly store = inject(BookingsStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly countries = inject(CountriesStore);
  protected readonly actions = inject(BookingsActionsService);

  protected readonly bookingMeta = BOOKING_META;
  protected readonly paymentMeta = PAYMENT_META;
  protected readonly locationMeta = LOCATION_META;
  protected readonly eventMeta = EVENT_META;
  protected readonly steps = STEPS;
  protected readonly vatPct = computed(() => Math.round((this.booking()?.vatRate ?? 0) * 100));
  protected readonly formOpen = signal(false);

  protected readonly booking = computed(() => this.store.all().find((b) => b.id === this.id()));

  /** 0-based index of the reached step; cancelled bookings stop where they were. */
  protected readonly stepIndex = computed(() => {
    const b = this.booking();
    if (!b) return 0;
    switch (b.status) {
      case 'scheduled': return 1;
      case 'in_progress': return 2;
      case 'completed': return 3;
      case 'cancelled': return b.events.some((e) => e.kind === 'started') ? 2 : 1;
    }
  });

  protected readonly timing = computed(() => {
    const b = this.booking();
    if (!b) return '';
    switch (b.status) {
      case 'scheduled': return `موعد الجلسة ${formatRelative(b.date)}`;
      case 'in_progress': return `الجلسة جارية — بدأت ${formatRelative(b.date)}`;
      case 'completed': return `اكتملت الجلسة ${formatRelative(new Date(b.date).getTime() + b.durationMin * 60000)}`;
      case 'cancelled': return 'تم إلغاء هذا الحجز';
    }
  });

  protected readonly subtotal = computed(() => {
    const b = this.booking();
    return b ? Math.max(0, b.price + b.homeFee - b.discount) : 0;
  });

  protected readonly timeRange = computed(() => {
    const b = this.booking();
    if (!b) return '';
    const fmt = new Intl.DateTimeFormat(APP_LOCALE, { hour: 'numeric', minute: '2-digit' });
    const start = new Date(b.date);
    return `${fmt.format(start)} — ${fmt.format(new Date(start.getTime() + b.durationMin * 60000))}`;
  });

  protected markPaid(): void {
    const b = this.booking();
    if (!b) return;
    this.store.markPaid(b.id);
    this.toast.success(`تم تسجيل دفع ${b.total} ${this.countries.symbol(b.countryId)} للحجز ${b.id}`);
  }

  protected print(): void {
    window.print();
  }

  protected async remove(): Promise<void> {
    const b = this.booking();
    if (b && (await this.actions.remove(b))) this.router.navigate(['/bookings']);
  }
}
