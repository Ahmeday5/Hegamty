import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { chartId, niceMax } from './chart.util';
import { formatCompact, formatNumber } from '../../utils/format.util';

const W = 560;
const PAD = { t: 26, r: 8, b: 34, l: 8 };

/**
 * Vertical bar chart with brand-gradient bars that grow in, a highlighted
 * maximum and hover emphasis. Labels are rendered RTL-safe (Arabic city
 * names shape correctly inside SVG `<text>`).
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + height()" role="img" [attr.aria-label]="ariaLabel()"
      (mouseleave)="hover.set(null)">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1fb5bf" />
          <stop offset="100%" stop-color="#064a50" />
        </linearGradient>
        <linearGradient [attr.id]="gid + 'm'" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#cdebed" />
          <stop offset="100%" stop-color="#e4f3f4" />
        </linearGradient>
      </defs>

      @for (b of bars(); track b.label; let i = $index) {
        <g class="bc__bar" [class.is-dim]="hover() !== null && hover() !== i" (mouseenter)="hover.set(i)">
          <rect class="bc__bg" [attr.x]="b.x" [attr.y]="PAD.t" [attr.width]="b.w"
            [attr.height]="b.base - PAD.t" rx="10" />
          <rect class="bc__fill" [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="10"
            [attr.fill]="'url(#' + (b.isMax || hover() === i ? gid : gid + 'm') + ')'"
            [style.animation-delay.ms]="i * 70" />
          <text class="bc__val" [class.is-on]="b.isMax || hover() === i" [attr.x]="b.x + b.w / 2"
            [attr.y]="b.y - 8">{{ fmt(b.value) }}</text>
          <text class="bc__label" [attr.x]="b.x + b.w / 2" [attr.y]="height() - 10">{{ b.label }}</text>
        </g>
      }
    </svg>
  `,
  styles: [`
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; overflow: visible; font-family: inherit; }
    .bc__bar { cursor: default; transition: opacity 0.2s; }
    .bc__bar.is-dim { opacity: 0.55; }
    .bc__bg { fill: #f5f8f8; }
    .bc__fill {
      transform-box: fill-box; transform-origin: bottom;
      animation: bc-grow 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
      transition: fill 0.2s;
    }
    .bc__val { font-size: 12px; font-weight: 700; fill: #86919a; text-anchor: middle; transition: fill 0.2s; }
    .bc__val.is-on { fill: #064a50; }
    .bc__label { font-size: 12px; fill: #56636a; text-anchor: middle; }
    @keyframes bc-grow { from { scale: 1 0; } }
    @media (prefers-reduced-motion: reduce) { .bc__fill { animation: none; } }
  `],
})
export class BarChartComponent {
  readonly labels = input.required<readonly string[]>();
  readonly values = input.required<readonly number[]>();
  readonly height = input(260);
  readonly compact = input(false);
  readonly ariaLabel = input('رسم بياني بالأعمدة');

  protected readonly W = W;
  protected readonly PAD = PAD;
  protected readonly gid = chartId('bc');
  protected readonly hover = signal<number | null>(null);

  protected readonly bars = computed(() => {
    const values = this.values();
    const n = Math.max(values.length, 1);
    const h = this.height();
    const base = h - PAD.b;
    const innerW = W - PAD.l - PAD.r;
    const slot = innerW / n;
    const w = Math.min(46, slot * 0.58);
    const max = niceMax(Math.max(1, ...values));
    const top = Math.max(...values);
    return values.map((value, i) => {
      const bh = ((base - PAD.t) * value) / max;
      return {
        label: this.labels()[i] ?? '',
        value,
        x: PAD.l + slot * i + (slot - w) / 2,
        w,
        h: bh,
        y: base - bh,
        base,
        isMax: value === top,
      };
    });
  });

  protected fmt(v: number): string {
    return this.compact() ? formatCompact(v) : formatNumber(v);
  }
}
