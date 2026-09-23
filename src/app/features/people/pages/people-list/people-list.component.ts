import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { KpiCardComponent, Tone } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { formatDate } from '../../../../shared/utils/format.util';
import { PersonFormComponent } from '../../components/person-form/person-form.component';
import { PEOPLE_CONFIG, STATUS_META } from '../../people.config';
import { CountryScopeService } from '../../../countries/country-scope.service';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';
import { Person, PersonKind, PersonStatus } from '../../people.models';
import { PeopleStore } from '../../people.store';
import { PeopleActionsService } from '../../people-actions.service';

type SortKey = 'name' | 'bookings' | 'balance' | 'rating' | 'joinedAt';

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

  protected readonly scope = inject(CountryScopeService);
  private readonly countries = inject(CountriesStore);

  /** City filter options follow the selected country (all live cities otherwise). */
  protected readonly cities = computed(() => {
    const c = this.scope.country();
    return c ? c.cities : [...new Set(this.countries.active().flatMap((x) => x.cities))];
  });
  protected readonly statusMeta = STATUS_META;
  protected readonly cfg = computed(() => PEOPLE_CONFIG[this.kind()]);
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  // ── filter / sort / paging state ──
  protected readonly search = signal('');
  protected readonly status = signal<PersonStatus | 'all'>('all');
  protected readonly city = signal<string>('all');
  protected readonly sort = signal<{ key: SortKey; dir: 1 | -1 }>({ key: 'joinedAt', dir: -1 });
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly loading = signal(true);

  // ── modal state ──
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Person | null>(null);

  private readonly all = computed(() => this.scope.filter(this.store.list(this.kind())()));

  protected readonly statusTabs = computed(() => {
    const list = this.all();
    const count = (s: PersonStatus) => list.filter((p) => p.status === s).length;
    return [
      { id: 'all' as const, label: 'الكل', count: list.length },
      ...(['active', 'inactive', 'pending', 'blocked'] as PersonStatus[]).map((s) => ({
        id: s,
        label: STATUS_META[s].label,
        count: count(s),
      })),
    ];
  });

  protected readonly kpis = computed<Kpi[]>(() => {
    const list = this.all();
    const cfg = this.cfg();
    const active = list.filter((p) => p.status === 'active').length;
    const bookings = list.reduce((a, p) => a + p.bookings, 0);
    const rated = list.filter((p) => p.rating > 0);
    const avgRating = rated.reduce((a, p) => a + p.rating, 0) / (rated.length || 1);
    const balance = this.scope.sum(list, (p) => p.balance);
    return [
      { label: `إجمالي ${cfg.title}`, value: list.length, icon: cfg.icon, tone: 'green', hint: 'جميع الحسابات المسجلة' },
      {
        label: 'الحسابات النشطة',
        value: active,
        icon: 'check-circle',
        tone: 'blue',
        hint: `${Math.round((active / (list.length || 1)) * 100)}% من الإجمالي`,
      },
      { label: `إجمالي ${cfg.countLabel}`, value: bookings, icon: 'calendar', tone: 'amber', hint: 'منذ بداية التشغيل' },
      this.kind() === 'customers'
        ? { label: 'أرصدة المحافظ', value: balance, icon: 'wallet', tone: 'purple', suffix: this.scope.currency(), hint: this.scope.isAll() ? 'محوّلة إلى العملة الأساسية' : 'إجمالي الأرصدة المتاحة' }
        : { label: 'متوسط التقييم', value: avgRating, icon: 'star', tone: 'purple', decimals: 1, suffix: '/ 5', hint: `${rated.length} حساب مُقيَّم` },
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
          (!!extra && extra.value(p).toLowerCase().includes(term)),
      )
      .sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (key === 'name') return (a.name.localeCompare(b.name, 'ar')) * dir;
        if (key === 'joinedAt') return (+new Date(av as string) - +new Date(bv as string)) * dir;
        if (key === 'balance') return (this.scope.toScope(a.balance, a.countryId) - this.scope.toScope(b.balance, b.countryId)) * dir;
        return ((av as number) - (bv as number)) * dir;
      });
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  protected readonly rows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });
  protected readonly hasFilters = computed(
    () => !!this.search().trim() || this.status() !== 'all' || this.city() !== 'all',
  );

  constructor() {
    const writes = { allowSignalWrites: true };

    // Simulated first-load latency → skeleton rows (swap for the real request).
    effect((onCleanup) => {
      this.kind();
      untracked(() => this.loading.set(true));
      const t = setTimeout(() => this.loading.set(false), 650);
      onCleanup(() => clearTimeout(t));
    }, writes);

    // Switching country invalidates the city filter and the current page.
    effect(() => {
      this.scope.selected();
      untracked(() => {
        this.city.set('all');
        this.page.set(1);
      });
    }, writes);

    // Adopt a search term handed over by the topbar.
    effect(() => {
      const q = this.q();
      if (q !== undefined) untracked(() => this.search.set(q));
    }, writes);

    // Never strand the user on an empty page after filtering / deleting.
    effect(() => {
      const total = this.totalPages();
      if (untracked(() => this.page()) > total) untracked(() => this.page.set(total));
    }, writes);
  }

  // ── handlers ──
  protected onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }
  protected setStatus(value: PersonStatus | 'all'): void {
    this.status.set(value);
    this.page.set(1);
  }
  protected setCity(value: string): void {
    this.city.set(value);
    this.page.set(1);
  }
  protected setPageSize(size: number): void {
    this.pageSize.set(size);
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
    if (s.key !== key) return null;
    return s.dir === 1 ? 'chevron-up' : 'chevron-down';
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }
  protected openEdit(p: Person, event?: Event): void {
    event?.stopPropagation();
    this.editing.set(p);
    this.formOpen.set(true);
  }
  protected openDetails(p: Person): void {
    this.router.navigate(['/', this.kind(), p.id]);
  }
  protected toggleBlock(p: Person, event: Event): void {
    event.stopPropagation();
    this.actions.toggleBlock(p);
  }
  protected remove(p: Person, event: Event): void {
    event.stopPropagation();
    this.actions.remove(p);
  }

  /** Excel-friendly CSV (UTF-8 BOM so Arabic renders correctly). */
  protected exportCsv(): void {
    const cfg = this.cfg();
    const header = ['المعرف', 'الاسم', 'الدولة', 'الهاتف', 'البريد', 'المدينة', cfg.countLabel, cfg.balanceLabel, 'الحالة', 'تاريخ الانضمام'];
    const lines = this.filtered().map((p) =>
      [p.id, p.name, this.countries.byId(p.countryId)?.name ?? '', p.phone, p.email, p.city, p.bookings, `${p.balance} ${this.countries.symbol(p.countryId)}`, STATUS_META[p.status].label, formatDate(p.joinedAt)]
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
