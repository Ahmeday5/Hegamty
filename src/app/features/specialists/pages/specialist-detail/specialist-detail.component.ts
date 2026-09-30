import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';
import { PreviewNoticeComponent } from '../../../../shared/components/dev-status/preview-notice.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { formatYears } from '../../../../shared/utils/format.util';
import { RecordLoader } from '../../../../core/utils/record-loader';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { CATALOG_PIPES } from '../../../services/service-catalog.pipes';
import { PERIOD_META, SUB_STATE_META } from '../../../packages/packages.models';
import { AccountPreviewService } from '../../../accounts/account-preview.service';
import { AccountHeroComponent, HeroStat } from '../../../accounts/components/account-hero/account-hero.component';
import { AccountTab, AccountTabsComponent } from '../../../accounts/components/account-tabs/account-tabs.component';
import { AccountDocument, AccountDocumentsComponent } from '../../../accounts/components/account-documents/account-documents.component';
import { ActivityStatsComponent } from '../../../accounts/components/activity/activity-stats.component';
import { ActivityBookingsComponent } from '../../../accounts/components/activity/activity-bookings.component';
import { ActivityReviewsComponent } from '../../../accounts/components/activity/activity-reviews.component';
import { ActivityNotificationsComponent } from '../../../accounts/components/activity/activity-notifications.component';
import { SPECIALIST_STATUS_META, Specialist, SpecialistService } from '../../specialists.models';
import { SpecialistsApi } from '../../specialists.api';
import { SpecialistActionsService } from '../../specialist-actions.service';

type Tab = 'overview' | 'services' | 'sessions' | 'reviews' | 'notifications';

const isNumericId = (id: string) => /^\d+$/.test(id);
const collator = new Intl.Collator('ar');

/**
 * Technician profile. Identity, documents, review status and offered
 * services come from the API; sessions, reviews, notifications, stats and
 * subscription render labelled demo data until their endpoints exist.
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
    ActivityStatsComponent,
    ActivityBookingsComponent,
    ActivityReviewsComponent,
    ActivityNotificationsComponent,
    CountryFlagComponent,
    ...FORMAT_PIPES,
    ...COUNTRY_PIPES,
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
  private readonly actions = inject(SpecialistActionsService);
  private readonly preview = inject(AccountPreviewService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statusMeta = SPECIALIST_STATUS_META;
  protected readonly subMeta = SUB_STATE_META;
  protected readonly periodMeta = PERIOD_META;

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

  protected readonly specialist = this.record.value;
  protected readonly busy = computed(() => {
    const s = this.specialist();
    return !!s && this.actions.busy().has(s.id);
  });

  /** Grouped by country, then by name. */
  protected readonly services = computed(() =>
    [...(this.offered.value() ?? [])].sort((a, b) => collator.compare(a.countryName, b.countryName) || collator.compare(a.name, b.name)),
  );

  // ── Demo sections ──
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
    { id: 'sessions', label: 'الجلسات', icon: 'calendar', dev: true },
    { id: 'reviews', label: 'التقييمات', icon: 'star', dev: true },
    { id: 'notifications', label: 'الإشعارات', icon: 'bell', dev: true },
  ]);
  protected readonly activeTab = computed<Tab>(() => {
    const t = this.tab();
    return this.tabs().some((x) => x.id === t) ? (t as Tab) : 'overview';
  });

  protected readonly heroStats = computed<HeroStat[]>(() => {
    const s = this.specialist();
    if (!s) return [];
    return [
      { label: 'العمر', value: s.age ? formatYears(s.age) : null },
      { label: 'الخبرة', value: s.experienceYears ? formatYears(s.experienceYears) : 'بدون خبرة' },
      { label: 'الخدمات', value: this.offered.state() === 'ready' ? this.services().length : null },
      { label: 'التقييم', dev: true },
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
