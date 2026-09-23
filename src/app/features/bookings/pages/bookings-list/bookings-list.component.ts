import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { KpiCardComponent, Tone } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { formatDateTime } from '../../../../shared/utils/format.util';
import { BOOKING_META } from '../../../people/people.config';
import { BookingFormComponent } from '../../components/booking-form/booking-form.component';
import { BookingsStore } from '../../bookings.store';
import { BookingsActionsService } from '../../bookings-actions.service';
import { CountryScopeService } from '../../../countries/country-scope.service';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';
import {
  BookingLocation,
  BookingRecord,
  BookingStatus,
  LOCATION_META,
  PAYMENT_META,
  PaymentStatus,
} from '../../bookings.models';

type Period = 'all' | 'today' | 'upcoming' | 'week' | 'month';
type SortKey = 'date' | 'total';

const DAY = 86400000;

@Component({
  selector: 'app-bookings-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    AvatarComponent,
    KpiCardComponent,
    PaginationComponent,
    BookingFormComponent,
    CountryFlagComponent,
    ...FORMAT_PIPES,
    ...COUNTRY_PIPES,
  ],
  templateUrl: './bookings-list.component.html',
  styleUrl: './bookings-list.component.scss',
})
export class BookingsListComponent {
  /** `?status=` deep link (e.g. from the dashboard). */
  readonly statusParam = input<string | undefined>(undefined, { alias: 'status' });

  private readonly store = inject(BookingsStore);
  protected readonly actions = inject(BookingsActionsService);
  private readonly router = inject(Router);

  protected readonly bookingMeta = BOOKING_META;
  protected readonly paymentMeta = PAYMENT_META;
  protected readonly locationMeta = LOCATION_META;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);
  protected readonly periods: { id: Period; label: string }[] = [
    { id: 'all', label: 'كل الفترات' },
    { id: 'today', label: 'اليوم' },
    { id: 'upcoming', label: 'القادمة' },
    { id: 'week', label: 'آخر 7 أيام' },
    { id: 'month', label: 'آخر 30 يومًا' },
  ];

  protected readonly search = signal('');
  protected readonly status = signal<BookingStatus | 'all'>('all');
  protected readonly period = signal<Period>('all');
  protected readonly location = signal<BookingLocation | 'all'>('all');
  protected readonly payment = signal<PaymentStatus | 'all'>('all');
  protected readonly sort = signal<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly loading = signal(true);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<BookingRecord | null>(null);

  protected readonly scope = inject(CountryScopeService);
  private readonly countries = inject(CountriesStore);
  private readonly all = computed(() => this.scope.filter(this.store.all()));

  protected readonly kpis = computed<{ label: string; value: number; icon: IconName; tone: Tone; suffix?: string; hint: string }[]>(() => {
    const list = this.all();
    const today = new Date().toDateString();
    const todays = list.filter((b) => new Date(b.date).toDateString() === today);
    const upcoming = list.filter((b) => b.status === 'scheduled').length;
    const completed = list.filter((b) => b.status === 'completed').length;
    const revenue = this.scope.sum(list.filter((b) => b.paymentStatus === 'paid'), (b) => b.total);
    return [
      { label: 'حجوزات اليوم', value: todays.length, icon: 'calendar', tone: 'green', hint: `${todays.filter((b) => b.status === 'in_progress').length} جلسة جارية الآن` },
      { label: 'حجوزات قادمة', value: upcoming, icon: 'clock', tone: 'blue', hint: 'مجدولة ومؤكدة' },
      { label: 'حجوزات مكتملة', value: completed, icon: 'check-circle', tone: 'teal', hint: `${Math.round((completed / (list.length || 1)) * 100)}% من الإجمالي` },
      {
        label: 'الإيرادات المحصلة',
        value: revenue,
        icon: 'wallet',
        tone: 'purple',
        suffix: this.scope.currency(),
        hint: this.scope.isAll() ? 'محوّلة إلى العملة الأساسية' : 'شاملة ضريبة القيمة المضافة',
      },
    ];
  });

  protected readonly statusTabs = computed(() => {
    const list = this.all();
    return [
      { id: 'all' as const, label: 'الكل', count: list.length },
      ...(Object.keys(BOOKING_META) as BookingStatus[]).map((s) => ({
        id: s,
        label: BOOKING_META[s].label,
        count: list.filter((b) => b.status === s).length,
      })),
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    const period = this.period();
    const location = this.location();
    const payment = this.payment();
    const { key, dir } = this.sort();
    const now = Date.now();
    const today = new Date().toDateString();

    return this.all()
      .filter((b) => status === 'all' || b.status === status)
      .filter((b) => location === 'all' || b.location === location)
      .filter((b) => payment === 'all' || b.paymentStatus === payment)
      .filter((b) => {
        const t = new Date(b.date).getTime();
        switch (period) {
          case 'today': return new Date(b.date).toDateString() === today;
          case 'upcoming': return t > now;
          case 'week': return t <= now && t > now - 7 * DAY;
          case 'month': return t <= now && t > now - 30 * DAY;
          default: return true;
        }
      })
      .filter(
        (b) =>
          !term ||
          b.id.toLowerCase().includes(term) ||
          b.customerName.toLowerCase().includes(term) ||
          b.customerPhone.includes(term) ||
          b.technicianName.toLowerCase().includes(term) ||
          b.serviceName.toLowerCase().includes(term),
      )
      .sort(
        (a, b) =>
          (key === 'date'
            ? +new Date(a.date) - +new Date(b.date)
            : this.scope.toScope(a.total, a.countryId) - this.scope.toScope(b.total, b.countryId)) * dir,
      );
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  protected readonly rows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });
  protected readonly hasFilters = computed(
    () =>
      !!this.search().trim() || this.status() !== 'all' || this.period() !== 'all' || this.location() !== 'all' || this.payment() !== 'all',
  );

  constructor() {
    const writes = { allowSignalWrites: true };
    effect((onCleanup) => {
      const t = setTimeout(() => this.loading.set(false), 650);
      onCleanup(() => clearTimeout(t));
    }, writes);
    effect(() => {
      const s = this.statusParam();
      if (s && s in BOOKING_META) untracked(() => this.status.set(s as BookingStatus));
    }, writes);
    effect(() => {
      this.scope.selected();
      untracked(() => this.page.set(1));
    }, writes);
    effect(() => {
      const total = this.totalPages();
      if (untracked(() => this.page()) > total) untracked(() => this.page.set(total));
    }, writes);
  }

  protected isToday(iso: string): boolean {
    return new Date(iso).toDateString() === new Date().toDateString();
  }

  protected update<T>(sig: { set(v: T): void }, value: T): void {
    sig.set(value);
    this.page.set(1);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.status.set('all');
    this.period.set('all');
    this.location.set('all');
    this.payment.set('all');
    this.page.set(1);
  }

  protected toggleSort(key: SortKey): void {
    this.sort.update((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));
  }
  protected sortIcon(key: SortKey): 'chevron-up' | 'chevron-down' | null {
    const s = this.sort();
    return s.key !== key ? null : s.dir === 1 ? 'chevron-up' : 'chevron-down';
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }
  protected openEdit(b: BookingRecord): void {
    this.editing.set(b);
    this.formOpen.set(true);
  }
  protected openDetails(b: BookingRecord): void {
    this.router.navigate(['/bookings', b.id]);
  }

  protected exportCsv(): void {
    const header = ['رقم الحجز', 'الدولة', 'العميل', 'الجوال', 'الخدمة', 'الفني', 'الموعد', 'المكان', 'الإجمالي', 'الدفع', 'الحالة'];
    const lines = this.filtered().map((b) =>
      [b.id, this.countries.byId(b.countryId)?.name ?? '', b.customerName, b.customerPhone, b.serviceName, b.technicianName,
        formatDateTime(b.date), LOCATION_META[b.location].label, `${b.total} ${this.countries.symbol(b.countryId)}`,
        PAYMENT_META[b.paymentStatus].label, BOOKING_META[b.status].label]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
