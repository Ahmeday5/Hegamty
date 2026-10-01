import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { BookingSheetService } from '../../booking-sheet.service';

/**
 * A booking number that opens the booking sheet — for records that only
 * reference a booking (reviews). Styled as an actionable chip: icon, number,
 * an "open" arrow, hover / focus states and a spinner while it loads.
 *
 *   <app-booking-ref [bookingId]="r.bookingId" [clientId]="r.client.id" [specialistId]="r.specialist.id" />
 */
@Component({
  selector: 'app-booking-ref',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <button type="button" class="bref" [class.is-loading]="loading()" [disabled]="loading()" [attr.data-tip]="'عرض تفاصيل الحجز #' + bookingId()"
      [attr.aria-label]="'عرض تفاصيل الحجز رقم ' + bookingId()" [attr.aria-busy]="loading()" (click)="open($event)">
      <app-icon class="bref__icon" name="calendar" [size]="13" />
      <span class="bref__label">حجز</span>
      <bdi class="bref__id">#{{ bookingId() }}</bdi>
      @if (loading()) {
        <span class="spinner-border bref__spin" aria-hidden="true"></span>
      } @else {
        <app-icon class="bref__go" name="arrow-up-right" [size]="12" />
      }
    </button>
  `,
  styles: [`
    :host { display: inline-flex; vertical-align: middle; }
    .bref {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 26px;
      padding: 0 8px 0 10px;
      border: 1px solid #c9e2e4;
      border-radius: 999px;
      background: var(--pr-l);
      color: var(--pr-d);
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.15s;
    }
    .bref__label { font-weight: 500; opacity: 0.8; }
    .bref__id { font-variant-numeric: tabular-nums; }
    .bref__go { opacity: 0.7; transition: transform 0.2s, opacity 0.2s; }
    .bref__spin { width: 11px; height: 11px; border-width: 2px; }
    .bref:hover:not(:disabled) {
      background: var(--grad-pr);
      border-color: transparent;
      color: var(--white);
      box-shadow: 0 6px 14px -8px rgba(6, 74, 80, 0.7);
    }
    .bref:hover:not(:disabled) .bref__go { opacity: 1; transform: translate(-2px, -2px); }
    .bref:active:not(:disabled) { transform: scale(0.97); }
    .bref:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--pr-ring); }
    .bref.is-loading { cursor: progress; opacity: 0.85; }
    @media (prefers-reduced-motion: reduce) { .bref, .bref__go { transition: none; } }
  `],
})
export class BookingRefComponent {
  readonly bookingId = input.required<string>();
  /** Parties of the booking — narrow the lookup (there's no single-booking endpoint). */
  readonly clientId = input<string | null>(null);
  readonly specialistId = input<string | null>(null);

  private readonly sheet = inject(BookingSheetService);
  protected readonly loading = computed(() => this.sheet.loadingId() === this.bookingId());

  protected open(event: Event): void {
    event.stopPropagation(); // never also trigger a clickable row / card underneath
    this.sheet.openById(this.bookingId(), { clientId: this.clientId(), specialistId: this.specialistId() });
  }
}
