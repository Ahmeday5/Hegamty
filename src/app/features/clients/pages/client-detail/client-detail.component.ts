import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';
import { PreviewNoticeComponent } from '../../../../shared/components/dev-status/preview-notice.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { formatDate, formatYears } from '../../../../shared/utils/format.util';
import { RecordLoader } from '../../../../core/utils/record-loader';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
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
import { Review } from '../../../reviews/reviews.models';
import { AccountReviewsComponent } from '../../../reviews/components/account-reviews.component';
import { ClientAddressesComponent } from '../../components/client-addresses/client-addresses.component';
import { CLIENT_ACTIVITY_META, Client, ClientAddress, activityOf } from '../../clients.models';
import { ClientsApi } from '../../clients.api';
import { ClientActionsService } from '../../client-actions.service';

type Tab = 'overview' | 'addresses' | 'bookings' | 'reviews' | 'notifications';

const isNumericId = (id: string) => /^\d+$/.test(id);

/**
 * Customer profile. Identity, residence, saved addresses, bookings, reviews,
 * activity and ban state come from the API; notifications render labelled
 * demo data until their endpoint exists.
 */
@Component({
  selector: 'app-client-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    DevBadgeComponent,
    PreviewNoticeComponent,
    CountryFlagComponent,
    AccountHeroComponent,
    AccountTabsComponent,
    AccountDocumentsComponent,
    ActivityNotificationsComponent,
    ActivitySummaryComponent,
    AccountBookingsComponent,
    AccountReviewsComponent,
    AccountPlaceComponent,
    ClientAddressesComponent,
    ...FORMAT_PIPES,
  ],
  templateUrl: './client-detail.component.html',
  styleUrl: './client-detail.component.scss',
})
export class ClientDetailComponent {
  /** Route param. */
  readonly id = input.required<string>();
  /** `?tab=` keeps the selected tab deep-linkable. */
  readonly tab = input<string>();

  private readonly api = inject(ClientsApi);
  private readonly bookingsApi = inject(BookingsApi);
  private readonly reviewsApi = inject(ReviewsApi);
  private readonly actions = inject(ClientActionsService);
  private readonly preview = inject(AccountPreviewService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly activityMeta = CLIENT_ACTIVITY_META;
  protected readonly activityOf = activityOf;
  protected readonly genderMeta = GENDER_META;
  protected readonly mapsUrl = mapsUrl;
  protected readonly formatGeoPoint = formatGeoPoint;

  protected readonly record = new RecordLoader<Client>((id) => this.api.byId(id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل بيانات العميل',
    isValidId: isNumericId,
  });
  protected readonly addresses = new RecordLoader<ClientAddress[]>((id) => this.api.addresses(id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل عناوين العميل',
    isValidId: isNumericId,
  });
  protected readonly bookings = new RecordLoader<Booking[]>((id) => this.bookingsApi.ofClient(id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل حجوزات العميل',
    isValidId: isNumericId,
  });
  protected readonly bookingStats = new RecordLoader<BookingStats>((id) => this.bookingsApi.statsOf('clients', id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل إحصائيات الحجوزات',
    isValidId: isNumericId,
  });
  protected readonly reviews = new RecordLoader<Review[]>((id) => this.reviewsApi.ofClient(id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل تقييمات العميل',
    isValidId: isNumericId,
  });

  protected readonly client = this.record.value;
  /** Server total first; the loaded list's length if the stats call fails. `null` = not known yet. */
  private readonly bookingsTotal = computed(
    () => this.bookingStats.value()?.all ?? (this.bookings.state() === 'ready' ? (this.bookings.value()?.length ?? 0) : null),
  );
  protected readonly busy = computed(() => {
    const c = this.client();
    return !!c && this.actions.busy().has(c.id);
  });

  /** Demo notifications. */
  protected readonly activity = computed(() => {
    const c = this.client();
    return c ? this.preview.activity('customers', c.id) : null;
  });

  protected readonly tabs = computed<AccountTab<Tab>[]>(() => [
    { id: 'overview', label: 'نظرة عامة', icon: 'grid' },
    { id: 'addresses', label: 'العناوين', icon: 'map-pin', count: this.addresses.value()?.length },
    { id: 'bookings', label: 'الحجوزات', icon: 'calendar', count: this.bookingsTotal() ?? undefined },
    { id: 'reviews', label: 'التقييمات', icon: 'star', count: this.reviews.value()?.length },
    { id: 'notifications', label: 'الإشعارات', icon: 'bell', dev: true },
  ]);
  protected readonly activeTab = computed<Tab>(() => {
    const t = this.tab();
    return this.tabs().some((x) => x.id === t) ? (t as Tab) : 'overview';
  });

  protected readonly heroStats = computed<HeroStat[]>(() => {
    const c = this.client();
    if (!c) return [];
    return [
      { label: 'الحجوزات', value: this.bookingsTotal() },
      { label: 'العناوين', value: this.addresses.state() === 'ready' ? (this.addresses.value()?.length ?? 0) : null },
      { label: 'العمر', value: c.age ? formatYears(c.age) : null },
      { label: 'تاريخ التسجيل', value: c.createdAt ? formatDate(c.createdAt) : null },
    ];
  });

  protected readonly documents = computed<AccountDocument[]>(() => {
    const c = this.client();
    if (!c) return [];
    return [
      { key: 'photo', label: 'الصورة الشخصية', url: c.photoUrl, icon: 'user' },
      { key: 'nationalId', label: 'البطاقة الشخصية', url: c.nationalIdUrl, icon: 'shield' },
    ];
  });

  constructor() {
    effect(
      () => {
        const id = this.id();
        untracked(() => {
          this.record.load(id);
          this.addresses.load(id);
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
    this.addresses.reload();
    this.bookings.reload();
    this.bookingStats.reload();
    this.reviews.reload();
  }

  protected async toggleBan(): Promise<void> {
    const c = this.client();
    if (!c) return;
    const updated = await this.actions.toggleBan(c);
    if (updated) this.record.set(updated);
  }
}
