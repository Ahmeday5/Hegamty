import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { chartId, niceMax, smoothPath } from './chart.util';
import { formatCompact, formatNumber } from '../../utils/format.util';

export interface ChartSeries {
  name: string;
  color: string;
  values: readonly number[];
}

const W = 720;
const PAD = { t: 16, r: 12, b: 30, l: 48 };

/**
 * Multi-series smooth area chart. Pure SVG (no chart lib), responsive through
 * `viewBox`, draws its lines in on every data change and shows a crosshair
 * tooltip on hover.
 */
@Component({
  selector: 'app-area-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ac" (mouseleave)="hover.set(null)">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + height()" role="img" [attr.aria-label]="ariaLabel()">
        <defs>
          @for (s of series(); track s.name; let i = $index) {
            <linearGradient [attr.id]="gid + i" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" [attr.stop-color]="s.color" stop-opacity="0.28" />
              <stop offset="100%" [attr.stop-color]="s.color" stop-opacity="0" />
            </linearGradient>
          }
        </defs>

        @for (t of geo().ticks; track t.v) {
          <line class="ac__grid" [attr.x1]="PAD.l" [attr.x2]="W - PAD.r" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="ac__ylabel" [attr.x]="PAD.l - 10" [attr.y]="t.y + 4">{{ t.label }}</text>
        }
        @for (l of geo().xLabels; track $index) {
          <text class="ac__xlabel" [attr.x]="l.x" [attr.y]="height() - 8">{{ l.label }}</text>
        }

        <!-- Re-keyed on data change so the draw-in animation replays -->
        @for (k of [geo()]; track k) {
          @for (s of k.lines; track s.name; let i = $index) {
            <path class="ac__area" [attr.d]="s.area" [attr.fill]="'url(#' + gid + i + ')'" />
            <path class="ac__line" [attr.d]="s.line" [attr.stroke]="s.color" pathLength="1" />
          }
        }

        @if (hover() !== null) {
          <line class="ac__cross" [attr.x1]="geo().xs[hover()!]" [attr.x2]="geo().xs[hover()!]"
            [attr.y1]="PAD.t" [attr.y2]="height() - PAD.b" />
          @for (s of geo().lines; track s.name) {
            <circle class="ac__dot" [attr.cx]="geo().xs[hover()!]" [attr.cy]="s.ys[hover()!]" r="5"
              [attr.stroke]="s.color" />
          }
        }

        @for (x of geo().xs; track $index; let i = $index) {
          <rect class="ac__hit" [attr.x]="x - geo().band / 2" [attr.y]="PAD.t" [attr.width]="geo().band"
            [attr.height]="height() - PAD.t - PAD.b" (mouseenter)="hover.set(i)" />
        }
      </svg>

      @if (hover() !== null) {
        <div class="ac__tip" [style.left.%]="(geo().xs[hover()!] / W) * 100"
          [class.ac__tip--flip]="geo().xs[hover()!] > W * 0.7">
          <div class="ac__tip-title">{{ labels()[hover()!] }}</div>
          @for (s of series(); track s.name) {
            <div class="ac__tip-row">
              <span class="ac__tip-dot" [style.background]="s.color"></span>
              <span>{{ s.name }}</span>
              <strong>{{ fmt(s.values[hover()!]) }}</strong>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ac { position: relative; direction: ltr; }
    svg { display: block; width: 100%; height: auto; overflow: visible; font-family: inherit; }
    .ac__grid { stroke: #edf1ee; stroke-dasharray: 4 6; }
    .ac__ylabel { font-size: 11px; fill: #9aa39d; text-anchor: end; }
    .ac__xlabel { font-size: 11px; fill: #9aa39d; text-anchor: middle; }
    .ac__area { opacity: 0; animation: ac-fade 0.9s ease 0.5s forwards; }
    .ac__line {
      fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round;
      stroke-dasharray: 1; stroke-dashoffset: 1;
      animation: ac-draw 1.4s cubic-bezier(0.65, 0, 0.35, 1) forwards;
    }
    .ac__cross { stroke: #c9d3cc; stroke-dasharray: 3 4; }
    .ac__dot { fill: #fff; stroke-width: 3; animation: ac-pop 0.2s ease both; transform-box: fill-box; transform-origin: center; }
    .ac__hit { fill: transparent; cursor: crosshair; }
    .ac__tip {
      position: absolute; top: 8px; translate: 12px 0; min-width: 150px;
      padding: 10px 12px; border-radius: 12px; background: #0d1f14; color: #fff;
      font-size: 12px; direction: rtl; pointer-events: none; z-index: 5;
      box-shadow: 0 12px 28px -8px rgba(0, 0, 0, 0.35);
      animation: ac-fade 0.15s ease both;
    }
    .ac__tip--flip { translate: calc(-100% - 12px) 0; }
    .ac__tip-title { margin-bottom: 6px; font-weight: 700; opacity: 0.8; }
    .ac__tip-row { display: flex; align-items: center; gap: 8px; line-height: 1.8; }
    .ac__tip-row strong { margin-inline-start: auto; font-variant-numeric: tabular-nums; }
    .ac__tip-dot { width: 8px; height: 8px; border-radius: 3px; }
    @keyframes ac-draw { to { stroke-dashoffset: 0; } }
    @keyframes ac-fade { to { opacity: 1; } from { opacity: 0; } }
    @keyframes ac-pop { from { scale: 0; } }
    @media (prefers-reduced-motion: reduce) {
      .ac__line { animation: none; stroke-dashoffset: 0; }
      .ac__area { animation: none; opacity: 1; }
    }
  `],
})
export class AreaChartComponent {
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  readonly height = input(280);
  readonly unit = input('');
  readonly ariaLabel = input('رسم بياني');

  protected readonly W = W;
  protected readonly PAD = PAD;
  protected readonly gid = chartId('ac');
  protected readonly hover = signal<number | null>(null);

  protected readonly geo = computed(() => {
    const labels = this.labels();
    const series = this.series();
    const h = this.height();
    const n = Math.max(labels.length, 1);
    const innerW = W - PAD.l - PAD.r;
    const innerH = h - PAD.t - PAD.b;
    const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)) * 1.08);
    const step = n > 1 ? innerW / (n - 1) : 0;
    const xs = labels.map((_, i) => PAD.l + i * step);
    const y = (v: number) => PAD.t + innerH - (v / max) * innerH;
    const base = PAD.t + innerH;

    const lines = series.map((s) => {
      const pts = s.values.map((v, i) => ({ x: xs[i], y: +y(v).toFixed(1) }));
      const line = smoothPath(pts);
      const area = pts.length ? `${line} L${pts[pts.length - 1].x},${base} L${pts[0].x},${base} Z` : '';
      return { name: s.name, color: s.color, line, area, ys: pts.map((p) => p.y) };
    });

    const ticks = [0, 1, 2, 3, 4].map((i) => {
      const v = (max / 4) * i;
      return { v, y: y(v), label: formatCompact(v) };
    });

    // Thin out x labels on dense series (e.g. 30 days) so they never collide.
    const every = Math.ceil(n / 12);
    const xLabels = labels
      .map((label, i) => ({ label, x: xs[i], i }))
      .filter((l) => l.i % every === 0 || l.i === n - 1);

    return { xs, lines, ticks, xLabels, band: step || innerW };
  });

  protected fmt(v: number): string {
    return `${formatNumber(v)}${this.unit() ? ' ' + this.unit() : ''}`;
  }
}
