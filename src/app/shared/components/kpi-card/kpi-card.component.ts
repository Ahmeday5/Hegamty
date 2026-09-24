import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';
import { SparklineComponent } from '../charts/sparkline.component';
import { CountUpDirective } from '../../directives/count-up.directive';

export type Tone = 'green' | 'blue' | 'amber' | 'purple' | 'teal' | 'pink' | 'red';

const TONE_COLOR: Record<Tone, string> = {
  green: '#20843d',
  blue: '#2563eb',
  amber: '#d97706',
  purple: '#7c3aed',
  teal: '#0d9488',
  pink: '#db2777',
  red: '#dc2626',
};

/**
 * Metric card: tinted icon, animated count-up value, trend delta and an
 * optional sparkline. Used by the dashboard and every list/detail page.
 */
@Component({
  selector: 'app-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, SparklineComponent, CountUpDirective],
  template: `
    <article class="kpi panel panel--hover" [style.--tone]="color()">
      <span class="kpi__glow" aria-hidden="true"></span>
      <header class="kpi__head">
        <span class="tile tile--{{ tone() }}"><app-icon [name]="icon()" [size]="19" /></span>
        @if (trend() !== null) {
          <span class="chip" [class.chip--green]="trend()! >= 0" [class.chip--red]="trend()! < 0">
            <app-icon [name]="trend()! >= 0 ? 'trending-up' : 'trending-down'" [size]="14" [stroke]="2.2" />
            {{ trendLabel() }}
          </span>
        }
      </header>
      <div class="kpi__body">
        <div>
          <p class="kpi__label">{{ label() }}</p>
          <p class="kpi__value">
            <span [appCountUp]="value()" [decimals]="decimals()"></span>
            @if (suffix()) { <small>{{ suffix() }}</small> }
          </p>
          @if (hint()) { <p class="kpi__hint">{{ hint() }}</p> }
        </div>
        @if (spark().length > 1) {
          <app-sparkline class="kpi__spark" [values]="spark()" [color]="color()" />
        }
      </div>
    </article>
  `,
  styles: [`
    :host { display: block; }
    .kpi { position: relative; overflow: hidden; padding: 14px 16px; height: 100%; }
    .kpi:hover { transform: translateY(-3px); }
    .kpi { transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.3s, border-color 0.3s; }
    .kpi__glow {
      position: absolute; inset-inline-end: -40px; top: -40px; width: 140px; height: 140px;
      border-radius: 50%; background: var(--tone); opacity: 0.07; filter: blur(8px);
      transition: opacity 0.3s, scale 0.4s;
    }
    .kpi:hover .kpi__glow { opacity: 0.13; scale: 1.2; }
    .kpi__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .kpi__body { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
    .kpi__label { margin: 0 0 2px; font-size: 12px; color: var(--txt2); font-weight: 500; }
    .kpi__value {
      margin: 0; font-size: 22px; font-weight: 700; color: var(--black); line-height: 1.2;
      font-variant-numeric: tabular-nums;
    }
    .kpi__value small { font-size: 13px; font-weight: 600; color: var(--txt3); margin-inline-start: 4px; }
    .kpi__hint { margin: 4px 0 0; font-size: 12px; color: var(--txt3); }
    .kpi__spark { width: 84px; height: 34px; flex-shrink: 0; }
  `],
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly icon = input.required<IconName>();
  readonly tone = input<Tone>('green');
  readonly trend = input<number | null>(null);
  readonly suffix = input('');
  readonly decimals = input(0);
  readonly hint = input('');
  readonly spark = input<readonly number[]>([]);

  protected readonly color = computed(() => TONE_COLOR[this.tone()]);
  protected readonly trendLabel = computed(() => {
    const t = this.trend() ?? 0;
    return `${t >= 0 ? '+' : ''}${t.toFixed(1)}%`;
  });
}
