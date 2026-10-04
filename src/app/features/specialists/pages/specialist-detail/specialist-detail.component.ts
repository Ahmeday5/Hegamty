import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';
import { PreviewNoticeComponent } from '../../../../shared/components/dev-status/preview-notice.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { formatNumber, formatYears } from '../../../../shared/utils/format.util';
import { RecordLoader } from '../../../../core/utils/record-loader';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { CATALOG_PIPES } from '../../../services/service-catalog.pipes';
import { SUB_STATE_META } from '../../../packages/packages.models';
import { PACKAGE_PIPES } from '../../../packages/packages.pipes';
import { AccountPreviewService } from '../../../accounts/account-preview.service';
import { AccountHeroComponent, HeroStat } from '../../../accounts/components/account-hero/account-hero.component';
import { AccountTab, AccountTabsComponent } from '../../../accounts/components/account-tabs/account-tabs.component';
import { AccountDocument, AccountDocumentsComponent } from '../../../accounts/components/account-documents/account-documents.component';
import { ActivityNotificationsComponent } from '../../../accounts/components/activity/activity-notifications.component';
import { ActivitySummaryComponent } from '../../../accounts/components/activity-summary/activity-summary.component';
import { AccountPlaceComponent } from '../../../accounts/components/account-place/account-place.component';
import { GENDER_META, formatGeoPoint, mapsUrl } from '../../../accounts/account-profile';
import { BookingsApi } from '../../../bookings/bookings.api';
import { Booking, BookingStats } from '../../../bookings/bookings.models';
import { AccountBookingsComponent } from '../../../bookings/components/account-bookings/account-bookings.component';
import { ReviewsApi } from '../../../reviews/reviews.api';
import { Review, summarizeRatings } from '../../../reviews/reviews.models';
import { AccountReviewsComponent } from '../../../reviews/components/account-reviews.component';
import { AVAILABILITY_META, SPECIALIST_STATUS_META, Specialist, SpecialistService, availabilityOf } from '../../specialists.models';
import { SpecialistsApi } from '../../specialists.api';
import { SpecialistActionsService } from '../../specialist-actions.service';

type Tab = 'overview' | 'services' | 'bookings' | 'reviews' | 'notifications';

const isNumericId = (id: string) => /^\d+$/.test(id);
const collator = new Intl.Collator('ar');

/**
 * Technician profile. Identity, work area, documents, review status,
 * offered services, bookings and reviews come from the API; notifications
 * and subscription render labelled demo data until their endpoints exist.
 */
@Component({
  selector: 'app-specialist-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    DevBadgeComponent,
    PreviewNoticeComponent,
    AccountHeroComponent,
    AccountTabsComponent,
    AccountDocumentsComponent,
    ActivityNotificationsComponent,
    ActivitySummaryComponent,
    AccountBookingsComponent,
    AccountReviewsComponent,
    CountryFlagComponent,
    AccountPlaceComponent,
    ...FORMAT_PIPES,
    ...COUNTRY_PIPES,
    ...PACKAGE_PIPES,
    ...CATALOG_PIPES,
  ],
  templateUrl: './specialist-detail.component.html',
  styleUrl: './specialist-detail.component.scss',
})
export class SpecialistDetailComponent {
  /** Route param. */
  readonly id = input.required<string>();
  /** `?tab=` keeps the selected tab deep-linkable. */
  readonly tab = input<string>();

  private readonly api = inject(SpecialistsApi);
  private readonly bookingsApi = inject(BookingsApi);
  private readonly reviewsApi = inject(ReviewsApi);
  private readonly actions = inject(SpecialistActionsService);
  private readonly preview = inject(AccountPreviewService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statusMeta = SPECIALIST_STATUS_META;
  protected readonly availabilityMeta = AVAILABILITY_META;
  protected readonly availabilityOf = availabilityOf;
  protected readonly genderMeta = GENDER_META;
  protected readonly mapsUrl = mapsUrl;
  protected readonly formatGeoPoint = formatGeoPoint;
  protected readonly subMeta = SUB_STATE_META;

  protected readonly record = new RecordLoader<Specialist>((id) => this.api.byId(id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل بيانات الفني',
    isValidId: isNumericId,
  });
  protected readonly offered = new RecordLoader<SpecialistService[]>((id) => this.api.services(id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل خدمات الفني',
    isValidId: isNumericId,
  });
  protected readonly bookings = new RecordLoader<Booking[]>((id) => this.bookingsApi.ofSpecialist(id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل حجوزات الفني',
    isValidId: isNumericId,
  });
  protected readonly bookingStats = new RecordLoader<BookingStats>((id) => this.bookingsApi.statsOf('specialists', id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل إحصائيات الحجوزات',
    isValidId: isNumericId,
  });
  protected readonly reviews = new RecordLoader<Review[]>((id) => this.reviewsApi.ofSpecialist(id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل تقييمات الفني',
    isValidId: isNumericId,
  });

  protected readonly specialist = this.record.value;
  /** Server total first; the loaded list's length if the stats call fails. `null` = not known yet. */
  private readonly bookingsTotal = computed(
    () => this.bookingStats.value()?.all ?? (this.bookings.state() === 'ready' ? (this.bookings.value()?.length ?? 0) : null),
  );
  protected readonly rating = computed(() => summarizeRatings(this.reviews.value() ?? []));
  protected readonly busy = computed(() => {
    const s = this.specialist();
    return !!s && this.actions.busy().has(s.id);
  });

  /** Grouped by country, then by name. */
  protected readonly services = computed(() =>
    [...(this.offered.value() ?? [])].sort((a, b) => collator.compare(a.countryName, b.countryName) || collator.compare(a.name, b.name)),
  );

  // ── Demo sections (notifications, subscription) ──
  protected readonly activity = computed(() => {
    const s = this.specialist();
    return s ? this.preview.activity('technicians', s.id) : null;
  });
  protected readonly subscription = computed(() => {
    const s = this.specialist();
    return s ? this.preview.subscription(s.id) : null;
  });

  protected readonly tabs = computed<AccountTab<Tab>[]>(() => [
    { id: 'overview', label: 'نظرة عامة', icon: 'grid' },
    { id: 'services', label: 'الخدمات', icon: 'droplet', count: this.offered.value()?.length },
    { id: 'bookings', label: 'الحجوزات', icon: 'calendar', count: this.bookingsTotal() ?? undefined },
    { id: 'reviews', label: 'التقييمات', icon: 'star', count: this.reviews.value()?.length },
    { id: 'notifications', label: 'الإشعارات', icon: 'bell', dev: true },
  ]);
  protected readonly activeTab = computed<Tab>(() => {
    const t = this.tab();
    return this.tabs().some((x) => x.id === t) ? (t as Tab) : 'overview';
  });

  protected readonly heroStats = computed<HeroStat[]>(() => {
    const s = this.specialist();
    if (!s) return [];
    // The profile's served aggregate shows at once; the loaded reviews take over when ready.
    const rating = this.reviews.state() === 'ready' ? this.rating() : s.rating;
    return [
      { label: 'الخبرة', value: s.experienceYears ? formatYears(s.experienceYears) : 'بدون خبرة' },
      { label: 'الخدمات', value: this.offered.state() === 'ready' ? this.services().length : null },
      { label: 'الحجوزات', value: this.bookingsTotal() },
      {
        label: 'التقييم',
        value: rating?.count ? formatNumber(rating.average, 1) : null,
        unit: '/ 5',
      },
    ];
  });

  protected readonly documents = computed<AccountDocument[]>(() => {
    const s = this.specialist();
    if (!s) return [];
    return [
      { key: 'photo', label: 'الصورة الشخصية', url: s.photoUrl, icon: 'user' },
      { key: 'idFront', label: 'البطاقة (وجه)', url: s.documents.idFront, icon: 'shield' },
      { key: 'idBack', label: 'البطاقة (ظهر)', url: s.documents.idBack, icon: 'shield' },
      { key: 'idWithPerson', label: 'صورة شخصية مع البطاقة', url: s.documents.idWithPerson, icon: 'user' },
    ];
  });

  constructor() {
    effect(
      () => {
        const id = this.id();
        untracked(() => {
          this.record.load(id);
          this.offered.load(id);
          this.bookings.load(id);
          this.bookingStats.load(id);
          this.reviews.load(id);
        });
      },
      { allowSignalWrites: true },
    );
  }

  protected selectTab(tab: Tab): void {
    this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected reload(): void {
    this.record.reload();
    this.offered.reload();
    this.bookings.reload();
    this.bookingStats.reload();
    this.reviews.reload();
  }

  protected approve(): void {
    this.act((s) => this.actions.approve(s));
  }

  protected reject(): void {
    this.act((s) => this.actions.reject(s));
  }

  protected toggleBan(): void {
    this.act((s) => this.actions.toggleBan(s));
  }

  private async act(run: (s: Specialist) => Promise<Specialist | null>): Promise<void> {
    const s = this.specialist();
    if (!s) return;
    const updated = await run(s);
    if (updated) this.record.set(updated);
  }
}
