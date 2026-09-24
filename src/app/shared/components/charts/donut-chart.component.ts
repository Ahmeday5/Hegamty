import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { formatNumber } from '../../utils/format.util';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

const R = 80;
const C = 2 * Math.PI * R;
const GAP = 3;

/** Animated donut with an interactive legend; hovering a slice focuses it in the center. */
@Component({
  selector: 'app-donut-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dn">
      <div class="dn__chart">
        <svg viewBox="0 0 200 200" role="img" [attr.aria-label]="centerLabel()">
          <circle class="dn__track" cx="100" cy="100" [attr.r]="R" />
          @for (s of slices(); track s.label; let i = $index) {
            <circle class="dn__slice" cx="100" cy="100" [attr.r]="R" [attr.stroke]="s.color"
              [class.is-dim]="active() !== null && active() !== i" [class.is-on]="active() === i"
              [style.--len]="s.len" [style.--off]="s.off" [style.--d]="i"
              (mouseenter)="active.set(i)" (mouseleave)="active.set(null)" />
          }
        </svg>
        <div class="dn__center">
          @if (active() !== null) {
            <strong>{{ fmtPct(slices()[active()!].pct) }}</strong>
            <span>{{ slices()[active()!].label }}</span>
          } @else {
            <strong>{{ fmt(total()) }}</strong>
            <span>{{ centerLabel() }}</span>
          }
        </div>
      </div>

      <ul class="dn__legend">
        @for (s of slices(); track s.label; let i = $index) {
          <li [class.is-on]="active() === i" (mouseenter)="active.set(i)" (mouseleave)="active.set(null)">
            <span class="dn__dot" [style.background]="s.color"></span>
            <span class="dn__label">{{ s.label }}</span>
            <span class="dn__val">{{ fmt(s.value) }}</span>
            <span class="dn__pct">{{ fmtPct(s.pct) }}</span>
          </li>
        }
      </ul>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .dn { display: grid; gap: 18px; }
    .dn__chart { position: relative; width: min(220px, 100%); margin-inline: auto; }
    svg { display: block; width: 100%; height: auto; rotate: -90deg; overflow: visible; }
    .dn__track { fill: none; stroke: #eff4f4; stroke-width: 22; }
    .dn__slice {
      fill: none; stroke-width: 22; stroke-linecap: butt; cursor: pointer;
      stroke-dasharray: var(--len) 503;
      stroke-dashoffset: calc(var(--off) * -1);
      transition: stroke-width 0.25s, opacity 0.25s;
      animation: dn-grow 1.1s cubic-bezier(0.22, 1, 0.36, 1) both;
      animation-delay: calc(var(--d) * 120ms);
    }
    .dn__slice.is-on { stroke-width: 28; }
    .dn__slice.is-dim { opacity: 0.35; }
    .dn__center {
      position: absolute; inset: 0; display: grid; place-content: center; text-align: center;
      pointer-events: none;
    }
    .dn__center strong { font-size: 26px; font-weight: 700; color: #000; font-variant-numeric: tabular-nums; }
    .dn__center span { font-size: 12px; color: #86919a; }
    .dn__legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    .dn__legend li {
      display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 10px;
      padding: 7px 10px; border-radius: 10px; font-size: 13px; cursor: default; transition: background 0.15s;
    }
    .dn__legend li.is-on, .dn__legend li:hover { background: #f3f7f7; }
    .dn__dot { width: 10px; height: 10px; border-radius: 4px; }
    .dn__label { color: #56636a; }
    .dn__val { font-weight: 700; font-variant-numeric: tabular-nums; }
    .dn__pct { min-width: 44px; text-align: end; font-size: 12px; color: #86919a; }
    @keyframes dn-grow { from { stroke-dasharray: 0 503; } }
    @media (prefers-reduced-motion: reduce) { .dn__slice { animation: none; } }
  `],
})
export class DonutChartComponent {
  readonly segments = input.required<readonly DonutSegment[]>();
  readonly centerLabel = input('الإجمالي');

  protected readonly R = R;
  protected readonly active = signal<number | null>(null);
  protected readonly total = computed(() => this.segments().reduce((a, s) => a + s.value, 0));

  protected readonly slices = computed(() => {
    const total = this.total() || 1;
    let off = 0;
    return this.segments().map((s) => {
      const full = (s.value / total) * C;
      const slice = { ...s, pct: s.value / total, len: Math.max(0, full - GAP), off };
      off += full;
      return slice;
    });
  });

  protected fmt(v: number): string {
    return formatNumber(v);
  }
  protected fmtPct(p: number): string {
    return `${Math.round(p * 100)}%`;
  }
}
