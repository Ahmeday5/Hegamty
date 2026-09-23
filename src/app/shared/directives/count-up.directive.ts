import { DestroyRef, Directive, ElementRef, NgZone, effect, inject, input } from '@angular/core';
import { formatNumber } from '../utils/format.util';

/**
 * Animates a number from its previous value to the new one (ease-out-expo).
 *
 *   <span [appCountUp]="revenue()" [suffix]="' ' + scope.currency()"></span>
 *   <span [appCountUp]="4.8" [decimals]="1"></span>
 *
 * Runs outside Angular — it writes `textContent` directly each frame, so no
 * change detection is triggered. Honors `prefers-reduced-motion`.
 */
@Directive({ selector: '[appCountUp]', standalone: true })
export class CountUpDirective {
  readonly appCountUp = input.required<number>();
  readonly decimals = input(0);
  readonly duration = input(1400);
  readonly prefix = input('');
  readonly suffix = input('');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private current = 0;
  private frame = 0;

  constructor() {
    effect(() => this.animateTo(this.appCountUp()));
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  private animateTo(target: number): void {
    cancelAnimationFrame(this.frame);
    const from = this.current;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from === target) {
      this.render(target);
      return;
    }

    const duration = this.duration();
    const start = performance.now();
    this.zone.runOutsideAngular(() => {
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        this.render(from + (target - from) * eased);
        if (t < 1) this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  private render(value: number): void {
    this.current = value;
    this.el.nativeElement.textContent = `${this.prefix()}${formatNumber(value, this.decimals())}${this.suffix()}`;
  }
}
