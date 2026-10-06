import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';
import { DevSectionComponent } from '../../../../shared/components/dev-status/dev-section.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { formatDate } from '../../../../shared/utils/format.util';
import { RecordLoader } from '../../../../core/utils/record-loader';
import { AccountHeroComponent, HeroStat } from '../../../accounts/components/account-hero/account-hero.component';
import { AccountTab, AccountTabsComponent } from '../../../accounts/components/account-tabs/account-tabs.component';
import { AccountDocument, AccountDocumentsComponent } from '../../../accounts/components/account-documents/account-documents.component';
import {
  DRIVER_ACTIVITY_META,
  DRIVER_AVAILABILITY_META,
  Driver,
  activityOf,
  availabilityOf,
  vehicleColorSwatch,
} from '../../drivers.models';
import { DRIVER_PIPES } from '../../drivers.pipes';
import { DriversApi } from '../../drivers.api';
import { DriverActionsService } from '../../driver-actions.service';

type Tab = 'overview' | 'trips' | 'reviews' | 'notifications';

const isNumericId = (id: string) => /^\d+$/.test(id);

/**
 * Driver profile. Identity, vehicle, account state and ban come from the
 * API; location, trips, ratings and notifications aren't served yet and are
 * marked "قيد التطوير" rather than filled with demo data.
 */
@Component({
  selector: 'app-driver-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    DevBadgeComponent,
    DevSectionComponent,
    AccountHeroComponent,
    AccountTabsComponent,
    AccountDocumentsComponent,
    ...FORMAT_PIPES,
    ...DRIVER_PIPES,
  ],
  templateUrl: './driver-detail.component.html',
  styleUrl: './driver-detail.component.scss',
})
export class DriverDetailComponent {
  /** Route param. */
  readonly id = input.required<string>();
  /** `?tab=` keeps the selected tab deep-linkable. */
  readonly tab = input<string>();

  private readonly api = inject(DriversApi);
  private readonly actions = inject(DriverActionsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly activityMeta = DRIVER_ACTIVITY_META;
  protected readonly availabilityMeta = DRIVER_AVAILABILITY_META;
  protected readonly activityOf = activityOf;
  protected readonly availabilityOf = availabilityOf;
  protected readonly colorSwatch = vehicleColorSwatch;

  protected readonly record = new RecordLoader<Driver>((id) => this.api.byId(id), {
    destroyRef: this.destroyRef,
    errorMessage: 'تعذّر تحميل بيانات السائق',
    isValidId: isNumericId,
  });

  protected readonly driver = this.record.value;
  protected readonly busy = computed(() => {
    const d = this.driver();
    return !!d && this.actions.busy().has(d.id);
  });

  protected readonly tabs: AccountTab<Tab>[] = [
    { id: 'overview', label: 'نظرة عامة', icon: 'grid' },
    { id: 'trips', label: 'الرحلات', icon: 'car', dev: true },
    { id: 'reviews', label: 'التقييمات', icon: 'star', dev: true },
    { id: 'notifications', label: 'الإشعارات', icon: 'bell', dev: true },
  ];
  protected readonly activeTab = computed<Tab>(() => {
    const t = this.tab();
    return this.tabs.some((x) => x.id === t) ? (t as Tab) : 'overview';
  });

  protected readonly heroStats = computed<HeroStat[]>(() => {
    const d = this.driver();
    if (!d) return [];
    return [
      { label: 'الرحلات', dev: true },
      { label: 'التقييم', dev: true },
      { label: 'رقم اللوحة', value: d.vehicle.plate || null },
      { label: 'تاريخ التسجيل', value: d.createdAt ? formatDate(d.createdAt) : null },
    ];
  });

  protected readonly documents = computed<AccountDocument[]>(() => {
    const d = this.driver();
    return d ? [{ key: 'photo', label: 'الصورة الشخصية', url: d.photoUrl, icon: 'user' }] : [];
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
    const d = this.driver();
    if (!d) return;
    const updated = await this.actions.toggleBan(d);
    if (updated) this.record.set(updated);
  }
}
