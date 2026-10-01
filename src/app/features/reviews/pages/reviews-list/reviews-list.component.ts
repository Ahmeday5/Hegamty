import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { downloadCsv } from '../../../../shared/utils/csv.util';
import { formatDate } from '../../../../shared/utils/format.util';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { ACCOUNT_PAGE_SIZES, AccountListController } from '../../../accounts/account-list.controller';
import { AccountOptionsService } from '../../../accounts/account-options.service';
import { PartyFilters, PartyFiltersState, partyLocation } from '../../../accounts/party-filters';
import { PartyFiltersComponent } from '../../../accounts/components/party-filters/party-filters.component';
import { BookingPartyComponent } from '../../../bookings/components/booking-party/booking-party.component';
import { BookingRefComponent } from '../../../bookings/components/booking-ref/booking-ref.component';
import { RATING_LABELS, STAR_VALUES, Stars } from '../../reviews.models';
import { ReviewsStore } from '../../reviews.store';
import { RatingStarsComponent } from '../../components/rating-stars.component';

type RatingParam = `${Stars}`;
const RATING_PARAMS = STAR_VALUES.map(String) as RatingParam[];

/**
 * Customer reviews of technicians, server-paged. The client / technician
 * filters (country → governorate → account on each side) default to the
 * header's country and are mirrored in the URL; the accounts go to the API,
 * the locations and the rating are applied in the browser (see
 * `ReviewsStore`). A review's booking number opens that booking. Read-only.
 */
@Component({
  selector: 'app-reviews-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    KpiCardComponent,
    PaginationComponent,
    PartyFiltersComponent,
    BookingPartyComponent,
    BookingRefComponent,
    RatingStarsComponent,
    ...FORMAT_PIPES,
  ],
  templateUrl: './reviews-list.component.html',
  styleUrl: './reviews-list.component.scss',
})
export class ReviewsListComponent {
  private readonly store = inject(ReviewsStore);
  private readonly options = inject(AccountOptionsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly parties = new PartyFiltersState();
  protected readonly list = new AccountListController<RatingParam>(RATING_PARAMS, { extraParams: this.parties.params });
  protected readonly pageSizes = ACCOUNT_PAGE_SIZES;
  protected readonly labels = RATING_LABELS;

  protected readonly items = this.store.items;
  protected readonly pageMeta = this.store.page;
  protected readonly status = this.store.status;
  protected readonly loadError = this.store.error;
  protected readonly exporting = signal(false);

  protected readonly firstLoad = computed(() => this.status() !== 'ready' && this.status() !== 'error' && !this.items().length);
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);
  protected readonly hasFilters = computed(() => this.list.status() !== 'all' || this.parties.hasAny());

  protected readonly ratingTabs = computed(() => {
    const s = this.store.summary();
    return [
      { id: 'all' as const, label: 'الكل', count: s?.count },
      ...STAR_VALUES.map((stars) => ({ id: String(stars) as RatingParam, label: `${stars} ★`, count: s?.breakdown.find((b) => b.stars === stars)?.count })),
    ];
  });

  protected readonly kpis = computed(() => {
    const s = this.store.summary();
    const count = s?.count ?? 0;
    const of = (stars: Stars[]) => s?.breakdown.filter((b) => stars.includes(b.stars)).reduce((n, b) => n + b.count, 0) ?? 0;
    const share = (n: number) => `${count ? Math.round((n / count) * 100) : 0}% من التقييمات`;
    const excellent = of([5]);
    const negative = of([1, 2]);
    return { count, average: s?.average ?? 0, excellent, negative, excellentHint: share(excellent), negativeHint: share(negative) };
  });

  constructor() {
    this.store.expire();
    effect(
      () => {
        const { status, page } = this.list.query();
        const { client, specialist } = this.parties.value();
        const filter = {
          clientId: client.accountId,
          specialistId: specialist.accountId,
          rating: status ? (Number(status) as Stars) : null,
          clientLocation: partyLocation(client),
          specialistLocation: partyLocation(specialist),
        };
        untracked(() => this.store.query(filter, page));
      },
      { allowSignalWrites: true },
    );
  }

  protected reload(): void {
    this.options.invalidate();
    this.store.reload();
  }

  protected goToPage(index: number): void {
    this.list.goToPage(index);
    queueMicrotask(() => document.querySelector('.rv-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected setParties(next: PartyFilters): void {
    this.parties.set(next);
  }

  protected resetFilters(): void {
    this.list.reset();
    this.parties.reset();
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
            'المعرف', 'رقم الحجز', 'العميل', 'دولة العميل', 'محافظة العميل', 'الفني', 'دولة الفني', 'محافظة الفني', 'التقييم', 'التعليق', 'التاريخ',
          ];
          downloadCsv(
            'reviews',
            header,
            rows.map((r) => [
              r.id, r.bookingId ?? '', r.client.name, r.client.place.country?.name ?? '', r.client.place.governorate?.name ?? '',
              r.specialist.name, r.specialist.place.country?.name ?? '', r.specialist.place.governorate?.name ?? '',
              r.rating, r.comment, r.createdAt ? formatDate(r.createdAt) : '',
            ]),
          );
          this.toast.success(`تم تصدير ${rows.length} تقييم`);
        },
        error: (err: ApiError) => {
          this.exporting.set(false);
          this.toast.error(apiErrorToMessage(err, 'تعذّر تصدير البيانات، حاول مرة أخرى.'));
        },
      });
  }
}
