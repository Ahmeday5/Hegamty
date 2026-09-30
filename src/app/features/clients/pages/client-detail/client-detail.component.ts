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
import { ActivityStatsComponent } from '../../../accounts/components/activity/activity-stats.component';
import { ActivityBookingsComponent } from '../../../accounts/components/activity/activity-bookings.component';
import { ActivityReviewsComponent } from '../../../accounts/components/activity/activity-reviews.component';
import { ActivityNotificationsComponent } from '../../../accounts/components/activity/activity-notifications.component';
import { CLIENT_ACTIVITY_META, Client, activityOf } from '../../clients.models';
import { ClientsApi } from '../../clients.api';
import { ClientActionsService } from '../../client-actions.service';

type Tab = 'overview' | 'bookings' | 'reviews' | 'notifications';

/**
 * Customer profile. Identity, location, activity and ban state come from the
 * API; bookings, reviews, notifications and stats render labelled demo data
 * until their endpoints exist.
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
    ActivityStatsComponent,
    ActivityBookingsComponent,
    ActivityReviewsComponent,
    ActivityNotificationsComponent,
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
  private readonly actions = inject(ClientActionsService);
  private readonly preview = inject(AccountPreviewService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly activityMeta = CLIENT_ACTIVITY_META;
  protected readonly activityOf = activityOf;

  protected readonly record = new RecordLoader<Client>((id) => this.api.byId(id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل بيانات العميل',
    isValidId: (id) => /^\d+$/.test(id),
  });

  protected readonly client = this.record.value;
  protected readonly busy = computed(() => {
    const c = this.client();
    return !!c && this.actions.busy().has(c.id);
  });

  /** Demo bookings / reviews / notifications / stats. */
  protected readonly activity = computed(() => {
    const c = this.client();
    return c ? this.preview.activity('customers', c.id) : null;
  });

  protected readonly tabs: AccountTab<Tab>[] = [
    { id: 'overview', label: 'نظرة عامة', icon: 'grid' },
    { id: 'bookings', label: 'الحجوزات', icon: 'calendar', dev: true },
    { id: 'reviews', label: 'التقييمات', icon: 'star', dev: true },
    { id: 'notifications', label: 'الإشعارات', icon: 'bell', dev: true },
  ];
  protected readonly activeTab = computed<Tab>(() => {
    const t = this.tab();
    return this.tabs.some((x) => x.id === t) ? (t as Tab) : 'overview';
  });

  protected readonly heroStats = computed<HeroStat[]>(() => {
    const c = this.client();
    if (!c) return [];
    return [
      { label: 'الحجوزات', dev: true },
      { label: 'العمر', value: c.age ? formatYears(c.age) : null },
      { label: 'تاريخ التسجيل', value: c.createdAt ? formatDate(c.createdAt) : null },
    ];
  });

  protected readonly documents = computed<AccountDocument[]>(() => {
    const c = this.client();
    return c ? [{ key: 'photo', label: 'الصورة الشخصية', url: c.photoUrl, icon: 'user' }] : [];
  });

  constructor() {
    effect(
      () => {
        const id = this.id();
        untracked(() => this.record.load(id));
      },
      { allowSignalWrites: true },
    );
  }

  protected selectTab(tab: Tab): void {
    this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected reload(): void {
    this.record.reload();
  }

  protected async toggleBan(): Promise<void> {
    const c = this.client();
    if (!c) return;
    const updated = await this.actions.toggleBan(c);
    if (updated) this.record.set(updated);
  }
}
