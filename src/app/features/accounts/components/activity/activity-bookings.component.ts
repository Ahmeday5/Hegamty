import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { BOOKING_META } from '../../../people/people.config';
import { BookingStatus, PersonBooking } from '../../../people/people.models';

/** An account's bookings / sessions log with a status filter. */
@Component({
  selector: 'app-activity-bookings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ...FORMAT_PIPES],
  template: `
    <div class="panel">
      <div class="panel__head">
        <h3 class="panel__title">سجل {{ title() }}</h3>
        <div class="seg">
          @for (t of tabs(); track t.id) {
            <button type="button" class="seg__btn" [class.is-on]="filter() === t.id" (click)="filter.set(t.id)">
              {{ t.label }} <span class="seg__count">{{ t.count }}</span>
            </button>
          }
        </div>
      </div>
      <div class="dtable-wrap mt">
        <table class="dtable">
          <thead><tr><th>رقم الحجز</th><th>الخدمة</th><th>{{ partyLabel() }}</th><th>التاريخ</th><th>السعر</th><th>الحالة</th></tr></thead>
          <tbody>
            @for (b of rows(); track b.id; let i = $index) {
              <tr [style.--d]="i">
                <td class="num">{{ b.id }}</td>
                <td>{{ b.service }}</td>
                <td>{{ b.party }}</td>
                <td class="muted">{{ b.date | arDate: true }}</td>
                <td class="num">{{ b.amount | num }}</td>
                <td><span class="chip chip--dot {{ meta[b.status].chip }}">{{ meta[b.status].label }}</span></td>
              </tr>
            } @empty {
              <tr><td colspan="6"><div class="empty"><span class="empty__icon"><app-icon name="calendar" [size]="24" /></span><p class="empty__title">لا توجد سجلات</p></div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .mt { margin-top: 12px; }
    .muted { color: var(--txt3); }
  `],
})
export class ActivityBookingsComponent {
  readonly bookings = input.required<PersonBooking[]>();
  /** "الحجوزات" / "الجلسات". */
  readonly title = input.required<string>();
  /** Header of the counter-party column ("الفني" / "العميل"). */
  readonly partyLabel = input.required<string>();

  protected readonly meta = BOOKING_META;
  protected readonly filter = signal<BookingStatus | 'all'>('all');

  protected readonly tabs = computed(() => {
    const list = this.bookings();
    return [
      { id: 'all' as const, label: 'الكل', count: list.length },
      ...(Object.keys(BOOKING_META) as BookingStatus[]).map((s) => ({
        id: s,
        label: BOOKING_META[s].label,
        count: list.filter((b) => b.status === s).length,
      })),
    ];
  });

  protected readonly rows = computed(() => {
    const f = this.filter();
    return this.bookings().filter((b) => f === 'all' || b.status === f);
  });
}
