import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { DURATION_MAX, DurationPriceForm } from './pricing-forms';

type Field = 'durationMin' | 'priceMin' | 'priceMax';

/**
 * One duration + price-range line: [مدة محددة | مفتوحة] · minutes · from · to.
 * Rendered with its own `[formGroup]`, so the parent owns validation and submit.
 */
@Component({
  selector: 'app-duration-price-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, IconComponent],
  templateUrl: './duration-price-row.component.html',
  styleUrl: './duration-price-row.component.scss',
})
export class DurationPriceRowComponent {
  readonly group = input.required<DurationPriceForm>();
  readonly idPrefix = input.required<string>();
  readonly currency = input('');
  readonly removable = input(false);
  /**
   * Whether "open-ended" may be chosen here. Only a country's sole row can be
   * open-ended — one price range then applies to the whole service there.
   */
  readonly allowOpen = input(true);
  /** Tooltip explaining why open-ended is unavailable. */
  readonly openHint = input('الجلسة المفتوحة تكون السعر الوحيد للدولة — احذف المدد الأخرى أولًا');
  readonly disabled = input(false);
  /** Parent-level error for this row (e.g. duplicate duration). */
  readonly rowError = input<string | null>(null);
  readonly remove = output<void>();

  protected readonly durationMax = DURATION_MAX;
  /** Bumped on every value/status/touch event so template reads stay fresh under OnPush. */
  protected readonly tick = signal(0);

  constructor() {
    let sub: Subscription | null = null;
    effect(
      () => {
        const g = this.group();
        sub?.unsubscribe();
        sub = g.events.subscribe(() => this.tick.update((n) => n + 1));
        this.tick.update((n) => n + 1);
      },
      { allowSignalWrites: true },
    );
    inject(DestroyRef).onDestroy(() => sub?.unsubscribe());
  }

  protected hasDuration(): boolean {
    this.tick();
    return this.group().controls.hasDuration.value;
  }

  /** Why "open-ended" is unavailable (shown as a tooltip); `null` when it's allowed. */
  protected openBlockedReason(): string | null {
    return this.allowOpen() || !this.hasDuration() ? null : this.openHint();
  }

  protected setTimed(timed: boolean): void {
    if (!timed && this.openBlockedReason()) return;
    const g = this.group();
    g.controls.hasDuration.setValue(timed);
    if (!timed) g.controls.durationMin.setValue(null);
  }

  protected err(field: Field): string | null {
    this.tick();
    const g = this.group();
    const c = g.controls[field];
    if (!(c.touched || c.dirty)) return null;
    if (field === 'durationMin') {
      if (g.errors?.['durationRequired']) return 'أدخل المدة';
      if (g.errors?.['durationInteger']) return 'رقم صحيح بالدقائق';
      if (g.errors?.['durationRange']) return `من 1 إلى ${DURATION_MAX} دقيقة`;
      return null;
    }
    if (c.errors?.['required']) return 'مطلوب';
    if (c.errors?.['min']) return 'لا يقل عن صفر';
    if (c.errors?.['max']) return 'قيمة كبيرة جدًا';
    if (field === 'priceMax' && g.errors?.['priceRange']) return 'أقل من السعر الأدنى';
    return null;
  }
}
