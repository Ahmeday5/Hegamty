import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/services/auth.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { AreaChartComponent, ChartSeries } from '../../shared/components/charts/area-chart.component';
import { DonutChartComponent, DonutSegment } from '../../shared/components/charts/donut-chart.component';
import { BarChartComponent } from '../../shared/components/charts/bar-chart.component';
import { CountUpDirective } from '../../shared/directives/count-up.directive';
import { FORMAT_PIPES } from '../../shared/pipes/format.pipes';
import { APP_LOCALE, formatLongDate } from '../../shared/utils/format.util';
import { PeopleStore } from '../people/people.store';
import { BOOKING_META } from '../people/people.config';
import { BookingStatus } from '../people/people.models';
import { BookingsStore } from '../bookings/bookings.store';
import { BookingRecord } from '../bookings/bookings.models';
import { ServicesStore } from '../services/services.store';
import { CountriesStore } from '../countries/countries.store';
import { CountryScopeService } from '../countries/country-scope.service';
import { CountryFlagComponent } from '../countries/country-flag.component';
import { COUNTRY_PIPES } from '../countries/country.pipes';
import { PERIODS, Period, SERIES_COLORS, SHARE_COLORS } from './dashboard.data';

const DAY = 86400000;
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const pct = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : cur ? 100 : 0);

/**
 * Operations overview. Every widget is derived from the stores through the
 * country scope, so switching country in the topbar re-computes the whole
 * page; money is shown in that country's currency, or converted to the
 * base currency across all countries.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    AvatarComponent,
    KpiCardComponent,
    AreaChartComponent,
    DonutChartComponent,
    BarChartComponent,
    CountUpDirective,
    CountryFlagComponent,
    ...FORMAT_PIPES,
    ...COUNTRY_PIPES,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly people = inject(PeopleStore);
  private readonly bookingsStore = inject(BookingsStore);
  private readonly servicesStore = inject(ServicesStore);
  private readonly countries = inject(CountriesStore);
  protected readonly scope = inject(CountryScopeService);

  protected readonly user = this.auth.currentUser;
  protected readonly today = formatLongDate(new Date());
  protected readonly greeting = new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير';
  protected readonly periods = PERIODS;
  protected readonly period = signal<Period>('month');
  protected readonly bookingMeta = BOOKING_META;

  // ── Scoped sources ──
  private readonly bookings = computed(() => this.scope.filter(this.bookingsStore.all()));
  private readonly customers = computed(() => this.scope.filter(this.people.list('customers')()));
  private readonly technicians = computed(() => this.scope.filter(this.people.list('technicians')()));
  private readonly drivers = computed(() => this.scope.filter(this.people.list('drivers')()));
  private readonly paid = computed(() => this.bookings().filter((b) => b.paymentStatus === 'paid'));

  private revenueOf(list: readonly BookingRecord[]): number {
    return this.scope.sum(list, (b) => b.total);
  }
  private inRange(list: readonly BookingRecord[], from: number, to: number): BookingRecord[] {
    return list.filter((b) => {
      const t = +new Date(b.date);
      return t >= from && t < to;
    });
  }

  // ── Hero ──
  protected readonly hero = computed(() => {
    const now = Date.now();
    const today = startOfDay(now);
    const todays = this.inRange(this.bookings(), today, today + DAY);
    const pendingJoins = [...this.technicians(), ...this.drivers()].filter((p) => p.status === 'pending').length;
    return {
      todayCount: todays.length,
      todayRevenue: this.revenueOf(todays.filter((b) => b.paymentStatus === 'paid')),
      upcoming: this.bookings().filter((b) => b.status === 'scheduled').length,
      pendingJoins,
      availableTechs: this.technicians().filter((t) => t.status === 'active').length,
      techCount: this.technicians().length,
    };
  });

  // ── KPIs (last 30 days vs the 30 before, 10-week sparklines) ──
  protected readonly kpis = computed(() => {
    const now = Date.now();
    const cur = [now - 30 * DAY, now] as const;
    const prev = [now - 60 * DAY, now - 30 * DAY] as const;
    const all = this.bookings();
    const paid = this.paid();

    const weeks = Array.from({ length: 10 }, (_, i) => [now - (10 - i) * 7 * DAY, now - (9 - i) * 7 * DAY] as const);
    const rated = (list: BookingRecord[]) => {
      const r = list.filter((b) => b.rating);
      return r.length ? r.reduce((a, b) => a + (b.rating ?? 0), 0) / r.length : 0;
    };
    const joinedIn = (from: number, to: number) =>
      this.customers().filter((c) => {
        const t = +new Date(c.joinedAt);
        return t >= from && t < to;
      }).length;

    const revCur = this.revenueOf(this.inRange(paid, ...cur));
    const revPrev = this.revenueOf(this.inRange(paid, ...prev));
    const bkCur = this.inRange(all, ...cur).length;
    const bkPrev = this.inRange(all, ...prev).length;
    const rtCur = rated(this.inRange(all, now - 90 * DAY, now));
    const rtPrev = rated(this.inRange(all, now - 180 * DAY, now - 90 * DAY));

    return {
      revenue: { value: revCur, trend: pct(revCur, revPrev), spark: weeks.map((w) => this.revenueOf(this.inRange(paid, ...w))) },
      bookings: { value: bkCur, trend: pct(bkCur, bkPrev), spark: weeks.map((w) => this.inRange(all, ...w).length) },
      customers: {
        value: this.customers().length,
        trend: pct(joinedIn(...cur), joinedIn(...prev)),
        spark: weeks.map((w) => joinedIn(...w)),
      },
      rating: { value: rtCur, trend: pct(rtCur, rtPrev), spark: weeks.map((w) => rated(this.inRange(all, ...w)) || rtCur) },
    };
  });

  // ── Revenue chart ──
  protected readonly revenue = computed(() => {
    const paid = this.paid();
    const now = Date.now();
    const period = this.period();

    if (period === 'year') {
      const fmt = new Intl.DateTimeFormat(APP_LOCALE, { month: 'short' });
      const base = new Date();
      const months = Array.from({ length: 12 }, (_, i) => new Date(base.getFullYear(), base.getMonth() - 11 + i, 1));
      const values = months.map((m) => {
        const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
        return Math.round(this.revenueOf(this.inRange(paid, m.getTime(), next.getTime())));
      });
      const half = (a: number, b: number) => values.slice(a, b).reduce((x, y) => x + y, 0);
      return {
        labels: months.map((m) => fmt.format(m)),
        series: [{ name: 'آخر 12 شهرًا', color: SERIES_COLORS.current, values }] as ChartSeries[],
        total: half(0, 12),
        delta: pct(half(6, 12), half(0, 6)),
        compareLabel: 'آخر 6 أشهر مقارنة بالـ 6 التي قبلها',
      };
    }

    const days = period === 'week' ? 7 : 30;
    const today = startOfDay(now);
    const dayFmt = new Intl.DateTimeFormat(APP_LOCALE, period === 'week' ? { weekday: 'short' } : { day: 'numeric' });
    const bucket = (offsetDays: number) =>
      Array.from({ length: days }, (_, i) => {
        const from = today - (days - 1 - i + offsetDays) * DAY;
        return Math.round(this.revenueOf(this.inRange(paid, from, from + DAY)));
      });
    const current = bucket(0);
    const previous = bucket(days);
    const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
    return {
      labels: Array.from({ length: days }, (_, i) => dayFmt.format(new Date(today - (days - 1 - i) * DAY))),
      series: [
        { name: period === 'week' ? 'آخر 7 أيام' : 'آخر 30 يومًا', color: SERIES_COLORS.current, values: current },
        { name: 'الفترة السابقة', color: SERIES_COLORS.previous, values: previous },
      ] as ChartSeries[],
      total: sum(current),
      delta: pct(sum(current), sum(previous)),
      compareLabel: 'مقارنة بالفترة السابقة',
    };
  });

  // ── Status donut (last 30 days) ──
  protected readonly bookingStatus = computed<DonutSegment[]>(() => {
    const recent = this.inRange(this.bookings(), Date.now() - 30 * DAY, Date.now() + 30 * DAY);
    return (Object.keys(BOOKING_META) as BookingStatus[]).map((s) => ({
      label: BOOKING_META[s].label,
      value: recent.filter((b) => b.status === s).length,
      color: BOOKING_META[s].color,
    }));
  });

  // ── Cities ──
  protected readonly cities = computed(() => {
    const map = new Map<string, number>();
    for (const b of this.bookings()) map.set(b.city, (map.get(b.city) ?? 0) + 1);
    const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
    return { labels: top.map(([k]) => k), values: top.map(([, v]) => v) };
  });

  // ── Top technicians (by completed sessions in scope, then rating) ──
  protected readonly topTechs = computed(() => {
    const done = new Map<string, number>();
    for (const b of this.bookings()) if (b.status === 'completed') done.set(b.technicianId, (done.get(b.technicianId) ?? 0) + 1);
    const list = this.technicians()
      .filter((t) => t.status === 'active')
      .map((t) => ({ ...t, sessions: done.get(t.id) ?? 0 }))
      .sort((a, b) => b.sessions - a.sessions || b.rating - a.rating)
      .slice(0, 5);
    const max = Math.max(1, ...list.map((t) => t.sessions));
    return list.map((t) => ({ ...t, pct: Math.round((t.sessions / max) * 100) }));
  });

  // ── Services share ──
  protected readonly services = computed(() => {
    const map = new Map<string, number>();
    for (const b of this.bookings()) map.set(b.serviceName, (map.get(b.serviceName) ?? 0) + 1);
    const total = this.bookings().length || 1;
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count], i) => ({ label, value: Math.round((count / total) * 100), color: SHARE_COLORS[i] }));
  });
  protected readonly topShare = computed(() => Math.max(1, ...this.services().map((s) => s.value)));

  protected readonly mini = computed(() => ({
    activeDrivers: this.drivers().filter((d) => d.status === 'active').length,
    homeVisits: this.inRange(this.bookings(), Date.now() - 30 * DAY, Date.now()).filter((b) => b.location === 'home').length,
  }));

  // ── Per-country breakdown (all-countries view only) ──
  protected readonly byCountry = computed(() => {
    const now = Date.now();
    const recent = this.inRange(this.bookingsStore.all(), now - 30 * DAY, now);
    const rows = this.countries.all().map((c) => {
      const cb = recent.filter((b) => b.countryId === c.id);
      const revenueBase = cb.filter((b) => b.paymentStatus === 'paid').reduce((a, b) => a + b.total * c.rateToBase, 0);
      return {
        country: c,
        bookings: cb.length,
        revenueBase,
        customers: this.people.list('customers')().filter((p) => p.countryId === c.id).length,
        technicians: this.people.list('technicians')().filter((p) => p.countryId === c.id).length,
        services: this.servicesStore.all().filter((s) => s.countryId === c.id && s.active).length,
      };
    });
    const max = Math.max(1, ...rows.map((r) => r.revenueBase));
    return rows
      .sort((a, b) => b.revenueBase - a.revenueBase || +b.country.active - +a.country.active)
      .map((r) => ({ ...r, share: Math.round((r.revenueBase / max) * 100) }));
  });

  // ── Recent bookings: closest to now (live, next up, just finished) ──
  protected readonly recent = computed(() => {
    const now = Date.now();
    return [...this.bookings()]
      .sort((a, b) => Math.abs(+new Date(a.date) - now) - Math.abs(+new Date(b.date) - now))
      .slice(0, 7);
  });
}
