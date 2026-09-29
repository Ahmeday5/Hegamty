import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { foldText } from '../../../../shared/utils/text-normalize.util';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { ALL_COUNTRIES, CountryScopeService } from '../../../countries/country-scope.service';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { CategoriesStore } from '../../categories.store';
import { CategoriesApi, SectionQuery } from '../../categories.api';
import { ServiceCategory } from '../../services.models';
import { CategoryFormComponent } from '../../components/category-form/category-form.component';
import { SectionIconComponent } from '../../components/section-icon/section-icon.component';
import { SectionCountriesDialogComponent } from '../../components/section-countries-dialog/section-countries-dialog.component';

type StatusFilter = 'all' | 'active' | 'inactive';

/** Server answer for one query; `ids: null` = the request failed. */
interface QueryResult {
  key: string;
  ids: ReadonlySet<string> | null;
}

const SEARCH_DEBOUNCE_MS = 300;
/** Flags a card shows before "+N". */
const FLAG_PREVIEW = 5;

const keyOf = (q: SectionQuery) => `${q.name ?? ''}|${q.countryId ?? ''}`;

/**
 * Services sections: browse, add, edit, show/hide, delete. Name search and
 * the header's country scope are server-side filters (`?name=&countryId=`).
 */
@Component({
  selector: 'app-categories-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    KpiCardComponent,
    CountryFlagComponent,
    CategoryFormComponent,
    SectionIconComponent,
    SectionCountriesDialogComponent,
    ...FORMAT_PIPES,
  ],
  templateUrl: './categories-page.component.html',
  styleUrl: './categories-page.component.scss',
})
export class CategoriesPageComponent {
  private readonly store = inject(CategoriesStore);
  private readonly api = inject(CategoriesApi);
  protected readonly scope = inject(CountryScopeService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly skeletons = [0, 1, 2, 3, 4, 5];
  protected readonly flagPreview = FLAG_PREVIEW;

  protected readonly status = this.store.status;
  protected readonly loadError = this.store.error;
  protected readonly hasItems = computed(() => this.store.all().length > 0);
  protected readonly scopedCountry = this.scope.country;

  // ── dialog ──
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ServiceCategory | null>(null);
  protected readonly countriesOpen = signal(false);
  private readonly countriesSectionId = signal<string | null>(null);
  /** Read live from the store, so the list reflects an edit made meanwhile. */
  protected readonly countriesSection = computed(() => this.store.byId(this.countriesSectionId()) ?? null);

  // ── list state ──
  protected readonly query = signal('');
  protected readonly filter = signal<StatusFilter>('all');
  /** Ids with an in-flight toggle or delete. */
  protected readonly busy = signal<ReadonlySet<string>>(new Set());
  protected readonly refreshing = signal(false);

  /**
   * Name + country filtering runs on the server. The store keeps the full
   * catalog (the services pickers need every section), so the page renders
   * the server's matching ids from the live store — toggles and edits made
   * while filtered show up immediately.
   */
  private readonly serverQuery = computed<SectionQuery>(() => ({
    name: this.query().trim() || undefined,
    countryId: this.scope.isAll() ? undefined : this.scope.selected(),
  }));
  private readonly queryResult = toSignal(
    toObservable(this.serverQuery).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged((a, b) => keyOf(a) === keyOf(b)),
      switchMap((q): Observable<QueryResult | null> => {
        if (!q.name && !q.countryId) return of(null);
        const key = keyOf(q);
        return this.api.search(q).pipe(
          map((list) => ({ key, ids: new Set(list.map((c) => c.id)) })),
          catchError(() => of({ key, ids: null })),
        );
      }),
    ),
    { initialValue: null },
  );

  private readonly isQueried = computed(() => {
    const q = this.serverQuery();
    return !!q.name || !!q.countryId;
  });
  /** True while the latest query hasn't been answered by the server yet. */
  protected readonly searching = computed(() => this.isQueried() && this.queryResult()?.key !== keyOf(this.serverQuery()));

  /** Sections matching search + country — before the status tab. */
  private readonly inScope = computed(() => {
    const all = this.store.all();
    if (!this.isQueried()) return all;
    const q = this.serverQuery();
    const result = this.queryResult();
    const serverIds = result && result.key === keyOf(q) ? result.ids : null;
    if (serverIds) return all.filter((c) => serverIds.has(c.id));
    // Until the server answers (or if it failed), match locally so the UI never stalls.
    const name = foldText(q.name);
    return all.filter(
      (c) => (!name || foldText(c.name).includes(name)) && (!q.countryId || c.countries.some((x) => x.id === q.countryId)),
    );
  });

  protected readonly counts = computed(() => {
    const list = this.inScope();
    const active = list.filter((c) => c.active).length;
    return { all: list.length, active, inactive: list.length - active };
  });

  protected readonly filters = computed(() => {
    const n = this.counts();
    return [
      { id: 'all' as const, label: 'الكل', count: n.all },
      { id: 'active' as const, label: 'مفعّلة', count: n.active },
      { id: 'inactive' as const, label: 'موقوفة', count: n.inactive },
    ];
  });

  protected readonly visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.inScope() : this.inScope().filter((c) => (f === 'active') === c.active);
  });

  protected readonly isFiltered = computed(() => !!this.query() || this.filter() !== 'all' || !this.scope.isAll());

  protected openCountries(c: ServiceCategory): void {
    this.countriesSectionId.set(c.id);
    this.countriesOpen.set(true);
  }

  /** "Edit countries" in the countries dialog → the section form. */
  protected editFromCountries(c: ServiceCategory): void {
    this.countriesOpen.set(false);
    this.openEdit(c);
  }

  protected countryNames(c: ServiceCategory): string {
    return c.countries.map((x) => x.name).join('، ');
  }

  /** "مصر، السعودية و3 أخرى" */
  protected countrySummary(c: ServiceCategory): string {
    const names = c.countries.map((x) => x.name);
    const head = names.slice(0, 2).join('، ');
    return names.length > 2 ? `${head} و${names.length - 2} أخرى` : head;
  }

  // ── actions ──

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(c: ServiceCategory): void {
    this.editing.set(c);
    this.formOpen.set(true);
  }

  protected clearFilters(): void {
    this.query.set('');
    this.filter.set('all');
    this.scope.select(ALL_COUNTRIES);
  }

  protected showAllCountries(): void {
    this.scope.select(ALL_COUNTRIES);
  }

  protected retry(): void {
    this.store.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
  }

  protected refresh(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.store
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.refreshing.set(false);
          this.toast.success('تم تحديث الأقسام');
        },
        error: () => this.refreshing.set(false),
      });
  }

  protected toggleActive(c: ServiceCategory): void {
    if (this.busy().has(c.id)) return;
    const next = !c.active;
    this.setBusy(c.id, true);
    this.store
      .setActive(c.id, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.setBusy(c.id, false);
          if (next) this.toast.success(`تم تفعيل قسم "${c.name}" وإظهاره في التطبيق`);
          else this.toast.warning(`تم إيقاف قسم "${c.name}" وإخفاء خدماته من التطبيق`);
        },
        error: (err: ApiError) => {
          this.setBusy(c.id, false);
          this.toast.error(apiErrorToMessage(err, 'تعذّر تغيير حالة القسم'), { title: `قسم "${c.name}"` });
        },
      });
  }

  protected async remove(c: ServiceCategory): Promise<void> {
    if (this.busy().has(c.id)) return;
    const ok = await this.dialog.confirm({
      title: 'حذف القسم',
      message: `سيتم حذف قسم "${c.name}" نهائيًا ولا يمكن التراجع. لن يكتمل الحذف إذا كانت هناك خدمات مرتبطة به.`,
      confirmText: 'حذف نهائي',
      type: 'danger',
    });
    if (!ok) return;

    this.setBusy(c.id, true);
    this.store
      .remove(c.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.setBusy(c.id, false);
          this.toast.success(`تم حذف قسم "${c.name}"`);
        },
        error: (err: ApiError) => {
          this.setBusy(c.id, false);
          const message =
            err?.status === 409
              ? 'القسم مرتبط بخدمات مسجّلة. انقل هذه الخدمات إلى قسم آخر أو احذفها أولًا، أو أوقف القسم بدلًا من حذفه.'
              : apiErrorToMessage(err, 'حدث خطأ أثناء الحذف، حاول مرة أخرى.');
          this.toast.error(message, { title: `تعذّر حذف "${c.name}"` });
        },
      });
  }

  private setBusy(id: string, on: boolean): void {
    this.busy.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
