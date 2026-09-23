import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { chartId, smoothPath } from './chart.util';

const W = 120;
const H = 40;

/** Tiny trend line for KPI cards. */
@Component({
  selector: 'app-sparkline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" [attr.stop-color]="color()" stop-opacity="0.3" />
          <stop offset="100%" [attr.stop-color]="color()" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path class="sp__area" [attr.d]="paths().area" [attr.fill]="'url(#' + gid + ')'" />
      <path class="sp__line" [attr.d]="paths().line" [attr.stroke]="color()" pathLength="1" />
    </svg>
  `,
  styles: [`
    :host { display: block; direction: ltr; }
    svg { display: block; width: 100%; height: 100%; overflow: visible; }
    .sp__area { opacity: 0; animation: sp-fade 0.8s ease 0.6s forwards; }
    .sp__line {
      fill: none; stroke-width: 2; stroke-linecap: round;
      stroke-dasharray: 1; stroke-dashoffset: 1;
      animation: sp-draw 1.3s cubic-bezier(0.65, 0, 0.35, 1) 0.2s forwards;
    }
    @keyframes sp-draw { to { stroke-dashoffset: 0; } }
    @keyframes sp-fade { to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .sp__line { animation: none; stroke-dashoffset: 0; }
      .sp__area { animation: none; opacity: 1; }
    }
  `],
})
export class SparklineComponent {
  readonly values = input.required<readonly number[]>();
  readonly color = input('#20843d');

  protected readonly W = W;
  protected readonly H = H;
  protected readonly gid = chartId('sp');

  protected readonly paths = computed(() => {
    const v = this.values();
    if (v.length < 2) return { line: '', area: '' };
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    const pts = v.map((val, i) => ({
      x: +((i / (v.length - 1)) * W).toFixed(1),
      y: +(H - 4 - ((val - min) / span) * (H - 8)).toFixed(1),
    }));
    const line = smoothPath(pts, 0.2);
    return { line, area: `${line} L${W},${H} L0,${H} Z` };
  });
}
