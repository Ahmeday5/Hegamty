import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { ActivityPreview } from '../../account-preview.service';

/** Totals + completion rate of an account's bookings / sessions. */
@Component({
  selector: 'app-activity-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DevBadgeComponent, ...FORMAT_PIPES],
  template: `
    <div class="panel">
      <div class="panel__head">
        <h3 class="panel__title">الإحصائيات</h3>
        @if (preview()) { <app-dev-badge tip="بيانات تجريبية للعرض فقط" /> }
      </div>
      <div class="panel__body">
        <div class="mini-stats">
          <div><small>{{ countLabel() }}</small><strong>{{ stats().total | num }}</strong></div>
          <div><small>المكتملة</small><strong class="ok">{{ stats().completed | num }}</strong></div>
          <div><small>الملغاة</small><strong class="bad">{{ stats().cancelled | num }}</strong></div>
          <div><small>التقييمات</small><strong>{{ stats().reviewsCount | num }}</strong></div>
        </div>
        <div class="rate">
          <div class="rate__head"><span>نسبة الإنجاز</span><strong>{{ stats().completionRate }}%</strong></div>
          <div class="bar bar--brand"><span class="bar__fill" [style.width.%]="stats().completionRate"></span></div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .mini-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .mini-stats > div { display: grid; gap: 2px; padding: 10px; border-radius: 12px; background: #f7fafa; border: 1px solid var(--brd); text-align: center; }
    .mini-stats small { font-size: 11px; color: var(--txt3); }
    .mini-stats strong { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .ok { color: #15803d; }
    .bad { color: var(--re); }
    .rate { margin-top: 14px; }
    .rate__head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 7px; font-size: 12.5px; color: var(--txt2); }
    .rate__head strong { color: var(--pr); }
    @media (max-width: 575px) { .mini-stats { grid-template-columns: repeat(2, 1fr); } }
  `],
})
export class ActivityStatsComponent {
  readonly stats = input.required<Omit<ActivityPreview, 'history' | 'rating'>>();
  /** "الحجوزات" / "الجلسات". */
  readonly countLabel = input.required<string>();
  /** Figures are demo data. */
  readonly preview = input(false);
}
