import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { KpiCardComponent, Tone } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { formatDate } from '../../../../shared/utils/format.util';
import { PersonFormComponent } from '../../components/person-form/person-form.component';
import { PEOPLE_CONFIG, STATUS_META, isNewAccount } from '../../people.config';
import { Person, PersonKind, PersonStatus } from '../../people.models';
import { PeopleStore } from '../../people.store';
import { PeopleActionsService } from '../../people-actions.service';
import { CountryScopeService } from '../../../countries/country-scope.service';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';
import { PackagesStore } from '../../../packages/packages.store';
import { SUB_STATE_META } from '../../../packages/packages.models';

type SortKey = 'name' | 'bookings' | 'rating' | 'joinedAt';

interface Kpi {
  label: string;
  value: number;
  icon: IconName;
  tone: Tone;
  suffix?: string;
  decimals?: number;
  hint?: string;
}

@Component({
  selector: 'app-people-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    AvatarComponent,
    KpiCardComponent,
    PaginationComponent,
    PersonFormComponent,
    CountryFlagComponent,
    ...FORMAT_PIPES,
    ...COUNTRY_PIPES,
  ],
  templateUrl: './people-list.component.html',
  styleUrl: './people-list.component.scss',
})
export class PeopleListComponent {
  /** Bound from route `data.kind`. */
  readonly kind = input.required<PersonKind>();
  /** Optional `?q=` coming from the topbar global search. */
  readonly q = input<string>();

  private readonly store = inject(PeopleStore);
  private readonly actions = inject(PeopleActionsService);
  private readonly router = inject(Router);
  private readonly countries = inject(CountriesStore);
  protected readonly packages = inject(PackagesStore);
  protected readonly scope = inject(CountryScopeService);

  protected readonly statusMeta = STATUS_META;
  protected readonly subMeta = SUB_STATE_META;
  protected readonly isNew = isNewAccount;
  protected readonly cfg = computed(() => PEOPLE_CONFIG[this.kind()]);
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  /** City filter options follow the selected country. */
  protected readonly cities = computed(() => {
    const c = this.scope.country();
    return c ? c.cities : [...new Set(this.countries.all().flatMap((x) => x.cities))];
  });

  // ── filter / sort / paging state ──
  protected readonly search = signal('');
  protected readonly status = signal<PersonStatus | 'all'>('all');
  protected readonly city = signal<string>('all');
  protected readonly sort = signal<{ key: SortKey; dir: 1 | -1 }>({ key: 'joinedAt', dir: -1 });
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly loading = signal(true);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Person | null>(null);

  private readonly all = computed(() => this.scope.filter(this.store.list(this.kind())()));

  protected readonly statusTabs = computed(() => {
    const list = this.all();
    return [
      { id: 'all' as const, label: 'الكل', count: list.length },
      ...(['active', 'inactive'] as PersonStatus[]).map((s) => ({
        id: s,
        label: STATUS_META[s].label,
        count: list.filter((p) => p.status === s).length,
      })),
    ];
  });

  protected readonly kpis = computed<Kpi[]>(() => {
    const list = this.all();
    const cfg = this.cfg();
    const active = list.filter((p) => p.status === 'active').length;
    const fresh = list.filter((p) => isNewAccount(p) && p.status === 'inactive').length;
    const bookings = list.reduce((a, p) => a + p.bookings, 0);
    const rated = list.filter((p) => p.rating > 0);
    const avgRating = rated.reduce((a, p) => a + p.rating, 0) / (rated.length || 1);

    const fourth: Kpi =
      this.kind() === 'technicians'
        ? {
            label: 'باقات سارية',
            value: list.filter((p) => ['active', 'expiring'].includes(this.subState(p))).length,
            icon: 'award',
            tone: 'purple',
            hint: 'فنيون يستقبلون الطلبات الآن',
          }
        : this.kind() === 'drivers'
          ? { label: 'متوسط التقييم', value: avgRating, icon: 'star', tone: 'purple', decimals: 1, suffix: '/ 5' }
          : { label: `إجمالي ${cfg.countLabel}`, value: bookings, icon: 'calendar', tone: 'purple' };

    return [
      { label: `إجمالي ${cfg.title}`, value: list.length, icon: cfg.icon, tone: 'green', hint: 'المسجلون من التطبيق' },
      { label: 'الحسابات النشطة', value: active, icon: 'check-circle', tone: 'blue', hint: `${Math.round((active / (list.length || 1)) * 100)}% من الإجمالي` },
      { label: 'طلبات بانتظار التفعيل', value: fresh, icon: 'user-plus', tone: 'amber', hint: 'تسجيلات جديدة غير مفعّلة' },
      fourth,
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    const city = this.city();
    const { key, dir } = this.sort();
    const extra = this.cfg().extra;

    return this.all()
      .filter((p) => status === 'all' || p.status === status)
      .filter((p) => city === 'all' || p.city === city)
      .filter(
        (p) =>
          !term ||
          p.name.toLowerCase().includes(term) ||
          p.phone.includes(term) ||
          p.email.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term) ||
          (p.nationalId ?? '').includes(term) ||
          (!!extra && extra.value(p).toLowerCase().includes(term)),
      )
      .sort((a, b) => {
        if (key === 'name') return a.name.localeCompare(b.name, 'ar') * dir;
        if (key === 'joinedAt') return (+new Date(a.joinedAt) - +new Date(b.joinedAt)) * dir;
        return (a[key] - b[key]) * dir;
      });
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  protected readonly rows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });
  protected readonly hasFilters = computed(() => !!this.search().trim() || this.status() !== 'all' || this.city() !== 'all');

  constructor() {
    const writes = { allowSignalWrites: true };
    effect((onCleanup) => {
      this.kind();
      untracked(() => this.loading.set(true));
      const t = setTimeout(() => this.loading.set(false), 500);
      onCleanup(() => clearTimeout(t));
    }, writes);
    effect(() => {
      this.scope.selected();
      untracked(() => {
        this.city.set('all');
        this.page.set(1);
      });
    }, writes);
    effect(() => {
      const q = this.q();
      if (q !== undefined) untracked(() => this.search.set(q));
    }, writes);
    effect(() => {
      const total = this.totalPages();
      if (untracked(() => this.page()) > total) untracked(() => this.page.set(total));
    }, writes);
  }

  protected subState(p: Person) {
    return this.packages.stateOf(this.packages.latestFor(p.id));
  }

  protected setFilter<T>(sig: { set(v: T): void }, value: T): void {
    sig.set(value);
    this.page.set(1);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.status.set('all');
    this.city.set('all');
    this.page.set(1);
  }

  protected toggleSort(key: SortKey): void {
    this.sort.update((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 }));
  }
  protected sortIcon(key: SortKey): 'chevron-up' | 'chevron-down' | null {
    const s = this.sort();
    return s.key !== key ? null : s.dir === 1 ? 'chevron-up' : 'chevron-down';
  }

  protected openEdit(p: Person): void {
    this.editing.set(p);
    this.formOpen.set(true);
  }
  protected openDetails(p: Person): void {
    this.router.navigate(['/', this.kind(), p.id]);
  }
  protected toggleActive(p: Person): void {
    this.actions.toggleActive(p);
  }
  protected remove(p: Person): void {
    this.actions.remove(p);
  }

  /** Excel-friendly CSV (UTF-8 BOM so Arabic renders correctly). */
  protected exportCsv(): void {
    const cfg = this.cfg();
    const header = ['المعرف', 'الاسم', 'الدولة', 'الهاتف', 'البريد', 'المدينة', 'الحي', cfg.countLabel, 'الحالة', 'تاريخ التسجيل'];
    const lines = this.filtered().map((p) =>
      [p.id, p.name, this.countries.byId(p.countryId)?.name ?? '', p.phone, p.email, p.city, p.district, p.bookings,
        STATUS_META[p.status].label, formatDate(p.joinedAt)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.kind()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
