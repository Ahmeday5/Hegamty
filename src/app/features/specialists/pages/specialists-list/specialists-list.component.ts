import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { downloadCsv } from '../../../../shared/utils/csv.util';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { ALL_COUNTRIES, CountryScopeService } from '../../../countries/country-scope.service';
import { ACCOUNT_PAGE_SIZES, AccountListController, BanFilter } from '../../../accounts/account-list.controller';
import { SPECIALIST_STATUSES, SPECIALIST_STATUS_META, Specialist, SpecialistStatus } from '../../specialists.models';
import { SpecialistsStore } from '../../specialists.store';
import { SpecialistActionsService } from '../../specialist-actions.service';

/**
 * Technicians list, fully server-driven: search (name or phone), review
 * status and paging go to the API and are mirrored in the URL. Country /
 * governorate filtering isn't supported by the backend yet.
 */
@Component({
  selector: 'app-specialists-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    AvatarComponent,
    KpiCardComponent,
    PaginationComponent,
    DevBadgeComponent,
    ...FORMAT_PIPES,
  ],
  templateUrl: './specialists-list.component.html',
  styleUrl: './specialists-list.component.scss',
})
export class SpecialistsListComponent {
  private readonly store = inject(SpecialistsStore);
  private readonly actions = inject(SpecialistActionsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly scope = inject(CountryScopeService);

  protected readonly list = new AccountListController<SpecialistStatus>(SPECIALIST_STATUSES, { banFilter: true });
  protected readonly statusMeta = SPECIALIST_STATUS_META;
  protected readonly pageSizes = ACCOUNT_PAGE_SIZES;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  protected readonly items = this.store.items;
  protected readonly pageMeta = this.store.page;
  protected readonly status = this.store.status;
  protected readonly loadError = this.store.error;
  protected readonly busy = this.actions.busy;
  protected readonly exporting = signal(false);

  /** Skeleton only on a cold load; later queries keep the stale rows (dimmed) until the new page lands. */
  protected readonly firstLoad = computed(() => this.status() !== 'ready' && this.status() !== 'error' && !this.items().length);

  protected readonly statusTabs = computed(() => {
    const c = this.store.counts();
    return [
      { id: 'all' as const, label: 'الكل', count: c?.all },
      ...SPECIALIST_STATUSES.map((s) => ({ id: s, label: SPECIALIST_STATUS_META[s].label, count: c?.[s] })),
    ];
  });

  protected readonly banTabs: { id: BanFilter; label: string }[] = [
    { id: 'all', label: 'الكل' },
    { id: 'allowed', label: 'غير محظور' },
    { id: 'banned', label: 'محظور' },
  ];

  protected readonly kpis = computed(() => {
    const c = this.store.counts();
    const all = c?.all ?? 0;
    const approved = c?.approved ?? 0;
    return {
      all,
      pending: c?.pending ?? 0,
      approved,
      rejected: c?.rejected ?? 0,
      approvedShare: all ? Math.round((approved / all) * 100) : 0,
    };
  });

  constructor() {
    effect(
      () => {
        const { search, status, banned, page } = this.list.query();
        untracked(() => this.store.query({ ...search, status, banned }, page));
      },
      { allowSignalWrites: true },
    );
    this.store.refreshCounts();
  }

  protected reload(): void {
    this.store.reload();
  }

  protected goToPage(index: number): void {
    this.list.goToPage(index);
    queueMicrotask(() => document.querySelector('.acc-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected showAllCountries(): void {
    this.scope.select(ALL_COUNTRIES);
  }

  protected openDetails(s: Specialist): void {
    this.router.navigate(['/technicians', s.id]);
  }

  protected approve(s: Specialist): void {
    this.actions.approve(s);
  }

  protected reject(s: Specialist): void {
    this.actions.reject(s);
  }

  protected toggleBan(s: Specialist): void {
    this.actions.toggleBan(s);
  }

  protected exportCsv(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.store
      .exportRows()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.exporting.set(false);
          if (!rows.length) {
            this.toast.info('لا توجد بيانات للتصدير');
            return;
          }
          const header = ['المعرف', 'الاسم', 'رقم الجوال', 'العمر', 'سنوات الخبرة', 'حالة المراجعة', 'محظور', 'النبذة'];
          downloadCsv(
            'technicians',
            header,
            rows.map((s) => [
              s.id, s.fullName, s.phone, s.age ?? '', s.experienceYears, SPECIALIST_STATUS_META[s.status].label,
              s.banned ? 'نعم' : 'لا', s.description,
            ]),
          );
          this.toast.success(`تم تصدير ${rows.length} فني`);
        },
        error: (err: ApiError) => {
          this.exporting.set(false);
          this.toast.error(apiErrorToMessage(err, 'تعذّر تصدير البيانات، حاول مرة أخرى.'));
        },
      });
  }
}
