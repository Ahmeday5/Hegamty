import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { SUB_STATE_META } from '../../packages.models';
import { PACKAGE_PIPES } from '../../packages.pipes';
import { SpecialistSubscription, subscriptionTimeline } from '../../subscriptions.models';

/**
 * Subscriptions as table rows (presentational). Paging, filtering and error
 * states belong to the caller. With the technician column shown, a row
 * click asks the caller to open that technician.
 */
@Component({
  selector: 'app-subscriptions-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, AvatarComponent, CountryFlagComponent, ...FORMAT_PIPES, ...PACKAGE_PIPES],
  templateUrl: './subscriptions-table.component.html',
  styleUrl: './subscriptions-table.component.scss',
})
export class SubscriptionsTableComponent {
  readonly rows = input.required<SpecialistSubscription[]>();
  /** On a technician's profile the technician is implied. */
  readonly showSpecialist = input(true);
  /** When listing more than one country. */
  readonly showCountry = input(false);
  /** Skeleton rows while nothing is loaded yet. */
  readonly loading = input(false);
  /** Dims the current rows while a newer page loads. */
  readonly stale = input(false);
  readonly emptyTitle = input('لا توجد اشتراكات');
  readonly emptyText = input('');
  readonly openSpecialist = output<string>();

  protected readonly stateMeta = SUB_STATE_META;
  protected readonly skeletonRows = Array.from({ length: 5 }, (_, i) => i);

  protected readonly view = computed(() => {
    const now = Date.now();
    return this.rows().map((sub) => ({ sub, time: subscriptionTimeline(sub, now) }));
  });

  protected readonly columns = computed(() => 5 + (this.showSpecialist() ? 2 : 0) + (this.showCountry() ? 1 : 0));
  protected readonly skeletonCells = computed(() => Array.from({ length: this.columns() }, (_, i) => i));

  protected open(sub: SpecialistSubscription): void {
    if (this.showSpecialist()) this.openSpecialist.emit(sub.specialistId);
  }
}
