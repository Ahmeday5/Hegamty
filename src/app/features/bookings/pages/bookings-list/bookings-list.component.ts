import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { KpiCardComponent, Tone } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { formatDateTime } from '../../../../shared/utils/format.util';
import { BOOKING_META } from '../../../people/people.config';
import { BookingsStore } from '../../bookings.store';
import { BookingsActionsService } from '../../bookings-actions.service';
import { BookingRecord, BookingStatus } from '../../bookings.models';
import { CountryScopeService } from '../../../countries/country-scope.service';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';

type Period = 'all' | 'today' | 'week' | 'month';
type SortKey = 'date' | 'price';
const DAY = 86400000;

@Component({
  selector: 'app-bookings-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, AvatarComponent, KpiCardComponent, PaginationComponent, CountryFlagComponent, ...FORMAT_PIPES, ...COUNTRY_PIPES],
  templateUrl: './bookings-list.component.html',
  styleUrl: './bookings-list.component.scss',
})
export class BookingsListComponent {
  /** `?status=` deep link (e.g. from the dashboard). */
  readonly statusParam = input<string | undefined>(undefined, { alias: 'status' });

  private readonly store = inject(BookingsStore);
  private readonly router = inject(Router);
  private readonly countries = inject(CountriesStore);
  protected readonly actions = inject(BookingsActionsService);
  protected readonly scope = inject(CountryScopeService);

  protected readonly bookingMeta = BOOKING_META;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);
  protected readonly periods: { id: Period; label: string }[] = [
    { id: 'all', label: 'كل الفترات' },
    { id: 'today', label: 'اليوم' },
    { id: 'week', label: 'آخر 7 أيام' },
    { id: 'month', label: 'آخر 30 يومًا' },
  ];

  protected readonly search = signal('');
  protected readonly status = signal<BookingStatus | 'all'>('all');
  protected readonly period = signal<Period>('all');
  protected readonly sort = signal<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly loading = signal(true);

  private readonly all = computed(() => this.scope.filter(this.store.all()));

  protected readonly kpis = computed<{ label: string; value: number; icon: IconName; tone: Tone; suffix?: string; hint: string }[]>(() => {
    const list = this.all();
    const today = new Date().toDateString();
    const todays = list.filter((b) => new Date(b.date).toDateString() === today);
    const completed = list.filter((b) => b.status === 'completed');
    const fourth = this.scope.isAll()
      ? { label: 'حجوزات ملغاة', value: list.filter((b) => b.status === 'cancelled').length, icon: 'ban' as IconName, tone: 'red' as Tone, hint: 'منذ بداية التشغيل' }
      : {
          label: 'قيمة الجلسات المكتملة',
          value: completed.reduce((a, b) => a + b.price, 0),
          icon: 'wallet' as IconName,
          tone: 'purple' as Tone,
          suffix: this.scope.currency(),
          hint: 'تُدفع للفني مباشرة',
        };
    return [
      { label: 'حجوزات اليوم', value: todays.length, icon: 'calendar', tone: 'green', hint: 'الحجز يتم في نفس اليوم' },
      { label: 'جلسات جارية الآن', value: list.filter((b) => b.status === 'in_progress').length, icon: 'activity', tone: 'amber', hint: 'قيد التنفيذ في منازل العملاء' },
      { label: 'حجوزات مكتملة', value: completed.length, icon: 'check-circle', tone: 'teal', hint: `${Math.round((completed.length / (list.length || 1)) * 100)}% من الإجمالي` },
      fourth,
    ];
  });

  protected readonly statusTabs = computed(() => {
    const list = this.all();
    return [
      { id: 'all' as const, label: 'الكل', count: list.length },
      ...(Object.keys(BOOKING_META) as BookingStatus[]).map((s) => ({ id: s, label: BOOKING_META[s].label, count: list.filter((b) => b.status === s).length })),
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    const period = this.period();
    const { key, dir } = this.sort();
    const now = Date.now();
    const today = new Date().toDateString();

    return this.all()
      .filter((b) => status === 'all' || b.status === status)
      .filter((b) => {
        const t = +new Date(b.date);
        if (period === 'today') return new Date(b.date).toDateString() === today;
        if (period === 'week') return t > now - 7 * DAY;
        if (period === 'month') return t > now - 30 * DAY;
        return true;
      })
      .filter(
        (b) =>
          !term ||
          b.id.toLowerCase().includes(term) ||
          b.customerName.toLowerCase().includes(term) ||
          b.customerPhone.includes(term) ||
          b.technicianName.toLowerCase().includes(term) ||
          (b.driverName ?? '').toLowerCase().includes(term) ||
          b.serviceName.toLowerCase().includes(term),
      )
      .sort((a, b) => (key === 'date' ? +new Date(a.date) - +new Date(b.date) : a.price - b.price) * dir);
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  protected readonly rows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });
  protected readonly hasFilters = computed(() => !!this.search().trim() || this.status() !== 'all' || this.period() !== 'all');

  constructor() {
    const writes = { allowSignalWrites: true };
    effect((onCleanup) => {
      const t = setTimeout(() => this.loading.set(false), 500);
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
    this.page.set(1);
  }

  protected toggleSort(key: SortKey): void {
    this.sort.update((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));
  }
  protected sortIcon(key: SortKey): 'chevron-up' | 'chevron-down' | null {
    const s = this.sort();
    return s.key !== key ? null : s.dir === 1 ? 'chevron-up' : 'chevron-down';
  }

  protected openDetails(b: BookingRecord): void {
    this.router.navigate(['/bookings', b.id]);
  }

  protected exportCsv(): void {
    const header = ['رقم الحجز', 'الدولة', 'العميل', 'الجوال', 'الخدمة', 'الفني', 'السائق', 'التاريخ', 'العنوان', 'السعر', 'الحالة'];
    const lines = this.filtered().map((b) =>
      [b.id, this.countries.byId(b.countryId)?.name ?? '', b.customerName, b.customerPhone, b.serviceName, b.technicianName, b.driverName ?? '',
        formatDateTime(b.date), b.address, `${b.price} ${this.countries.currency(b.countryId)}`, BOOKING_META[b.status].label]
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
