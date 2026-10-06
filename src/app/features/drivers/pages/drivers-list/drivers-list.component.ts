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
import { formatDate } from '../../../../shared/utils/format.util';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { ALL_COUNTRIES, CountryScopeService } from '../../../countries/country-scope.service';
import { ACCOUNT_PAGE_SIZES, AccountListController, BanFilter } from '../../../accounts/account-list.controller';
import {
  DRIVER_ACTIVITIES,
  DRIVER_ACTIVITY_META,
  DRIVER_AVAILABILITY_META,
  Driver,
  DriverActivity,
  activityOf,
  availabilityOf,
  isNewDriver,
  vehicleColorLabel,
} from '../../drivers.models';
import { DRIVER_PIPES } from '../../drivers.pipes';
import { DriversStore } from '../../drivers.store';
import { DriverActionsService } from '../../driver-actions.service';

/** Data columns + the actions column. */
const COLUMNS = 10;

/**
 * Drivers list, fully server-driven: search (name or phone), activity, ban
 * state and paging go to `/admin/drivers` and are mirrored in the URL.
 * Drivers aren't tied to a country yet, so the header's country scope
 * doesn't filter this list (the page says so).
 */
@Component({
  selector: 'app-drivers-list',
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
    ...DRIVER_PIPES,
  ],
  templateUrl: './drivers-list.component.html',
  styleUrl: './drivers-list.component.scss',
})
export class DriversListComponent {
  private readonly store = inject(DriversStore);
  private readonly actions = inject(DriverActionsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scope = inject(CountryScopeService);

  protected readonly list = new AccountListController<DriverActivity>(DRIVER_ACTIVITIES, { banFilter: true });
  protected readonly activityMeta = DRIVER_ACTIVITY_META;
  protected readonly availabilityMeta = DRIVER_AVAILABILITY_META;
  protected readonly activityOf = activityOf;
  protected readonly availabilityOf = availabilityOf;
  protected readonly isNew = isNewDriver;
  protected readonly pageSizes = ACCOUNT_PAGE_SIZES;
  protected readonly columns = COLUMNS;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);
  protected readonly skeletonCells = Array.from({ length: COLUMNS - 2 }, (_, i) => i);

  protected readonly rows = this.store.items;
  protected readonly pageMeta = this.store.page;
  protected readonly status = this.store.status;
  protected readonly loadError = this.store.error;
  protected readonly busy = this.actions.busy;
  protected readonly exporting = signal(false);
  /** The header's country — shown in a notice, since it can't filter drivers yet. */
  protected readonly country = this.scope.country;

  /** Skeleton only on a cold load; later queries keep the stale rows (dimmed) until the new page lands. */
  protected readonly firstLoad = computed(() => this.status() !== 'ready' && this.status() !== 'error' && !this.rows().length);

  protected readonly statusTabs = computed(() => {
    const c = this.store.counts();
    return [
      { id: 'all' as const, label: 'الكل', count: c?.all },
      { id: 'active' as const, label: DRIVER_ACTIVITY_META.active.label, count: c?.active },
      { id: 'inactive' as const, label: DRIVER_ACTIVITY_META.inactive.label, count: c?.inactive },
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
    const active = c?.active ?? 0;
    return {
      all,
      active,
      inactive: c?.inactive ?? 0,
      banned: c?.banned ?? 0,
      activeShare: all ? Math.round((active / all) * 100) : 0,
    };
  });

  constructor() {
    effect(
      () => {
        const { search, status, banned, page } = this.list.query();
        untracked(() => this.store.query({ ...search, active: status === null ? null : status === 'active', banned }, page));
      },
      { allowSignalWrites: true },
    );
    this.store.expireCounts();
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

  protected openDetails(d: Driver): void {
    this.router.navigate(['/drivers', d.id]);
  }

  protected toggleBan(d: Driver): void {
    this.actions.toggleBan(d);
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
          const header = [
            'المعرف', 'الاسم', 'رقم الجوال', 'الرقم القومي', 'المركبة', 'اللون', 'نوع المركبة', 'رقم اللوحة',
            'الحالة', 'التوفر', 'محظور', 'تاريخ التسجيل',
          ];
          downloadCsv(
            'drivers',
            header,
            rows.map((d) => [
              d.id, d.fullName, d.phone, d.nationalIdNumber, d.vehicle.model, d.vehicle.color ? vehicleColorLabel(d.vehicle.color) : '',
              d.vehicle.type, d.vehicle.plate, DRIVER_ACTIVITY_META[activityOf(d)].label, DRIVER_AVAILABILITY_META[availabilityOf(d)].label,
              d.banned ? 'نعم' : 'لا', d.createdAt ? formatDate(d.createdAt) : '',
            ]),
          );
          this.toast.success(`تم تصدير ${rows.length} سائق`);
        },
        error: (err: ApiError) => {
          this.exporting.set(false);
          this.toast.error(apiErrorToMessage(err, 'تعذّر تصدير البيانات، حاول مرة أخرى.'));
        },
      });
  }
}
