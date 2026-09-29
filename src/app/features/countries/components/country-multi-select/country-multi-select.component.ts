import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { foldText } from '../../../../shared/utils/text-normalize.util';
import { CountriesStore } from '../../countries.store';
import { CountryFlagComponent } from '../../country-flag.component';

/** Show the search box once the list is long enough to need it. */
const SEARCH_THRESHOLD = 8;

/**
 * Pick one or more countries from the catalog, as flag chips.
 *
 *   <app-country-multi-select [(value)]="countryIds" [invalid]="submitted() && !countryIds().length" />
 */
@Component({
  selector: 'app-country-multi-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, CountryFlagComponent],
  template: `
    <div class="cms" [class.is-invalid]="invalid()" [class.is-disabled]="disabled()">
      <div class="cms__bar">
        <span class="cms__count">
          @if (value().length) { المختارة: <strong>{{ value().length }}</strong> من {{ countries().length }} }
          @else { لم يتم اختيار أي دولة }
        </span>
        <div class="cms__bulk">
          <button type="button" class="btn btn-ghost btn-sm" [disabled]="disabled() || allSelected()" (click)="selectAll()">تحديد الكل</button>
          <button type="button" class="btn btn-ghost btn-sm" [disabled]="disabled() || !value().length" (click)="clear()">إلغاء التحديد</button>
        </div>
      </div>

      @if (countries().length > searchThreshold) {
        <label class="search cms__search">
          <app-icon name="search" [size]="15" />
          <input type="search" [value]="query()" (input)="query.set($any($event.target).value)" [disabled]="disabled()"
            placeholder="ابحث عن دولة" aria-label="بحث عن دولة" />
        </label>
      }

      <div class="cms__grid" role="group" [attr.aria-label]="label()">
        @for (c of filtered(); track c.id) {
          @let on = selected().has(c.id);
          <button type="button" class="cms__opt" role="checkbox" [class.is-on]="on" [attr.aria-checked]="on" [disabled]="disabled()"
            (click)="toggle(c.id)">
            <app-country-flag [countryId]="c.id" [size]="22" />
            <span class="cms__name" [attr.title]="c.name">{{ c.name }}</span>
            <span class="cms__check" aria-hidden="true">@if (on) { <app-icon name="check" [size]="12" [stroke]="3" /> }</span>
          </button>
        } @empty {
          <p class="cms__empty">{{ countries().length ? 'لا توجد دولة بهذا الاسم' : 'لا توجد دول — أضف الدول أولًا' }}</p>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .cms {
      display: grid;
      gap: 10px;
      padding: 12px;
      border: 1.5px solid var(--brd);
      border-radius: 14px;
      background: var(--white);
      transition: border-color 0.18s;
    }
    .cms.is-invalid { border-color: var(--re); }
    .cms.is-disabled { opacity: 0.65; }
    .cms__bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .cms__count { font-size: 12px; color: var(--txt3); }
    .cms__count strong { color: var(--pr-d); font-weight: 700; }
    .cms__bulk { display: flex; gap: 2px; }
    .cms__search input { height: 34px; background: var(--bg); }
    .cms__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 6px;
      max-height: 232px;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 2px;
    }
    .cms__opt {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 7px 9px;
      border: 1.5px solid var(--brd);
      border-radius: 10px;
      background: var(--white);
      color: var(--txt);
      font-family: inherit;
      text-align: start;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .cms__opt:hover:not(:disabled) { border-color: #b8dcdf; background: #f5fbfb; }
    .cms__opt:focus-visible { outline: 3px solid var(--pr-ring); outline-offset: 1px; }
    .cms__opt:disabled { cursor: not-allowed; }
    .cms__opt.is-on { border-color: var(--pr); background: var(--pr-l); }
    .cms__name { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; color: var(--txt); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cms__check {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      border-radius: 6px;
      border: 1.5px solid var(--brd2);
      background: var(--white);
      color: var(--white);
      transition: background 0.15s, border-color 0.15s;
    }
    .cms__opt.is-on .cms__check { background: var(--pr); border-color: var(--pr); }
    .cms__empty { grid-column: 1 / -1; margin: 6px 0; font-size: 12px; color: var(--txt3); text-align: center; }
  `],
})
export class CountryMultiSelectComponent {
  readonly value = model<string[]>([]);
  readonly label = input('الدول');
  readonly invalid = input(false);
  readonly disabled = input(false);

  protected readonly countries = inject(CountriesStore).all;
  protected readonly searchThreshold = SEARCH_THRESHOLD;
  protected readonly query = signal('');

  protected readonly selected = computed(() => new Set(this.value()));
  protected readonly allSelected = computed(() => this.countries().every((c) => this.selected().has(c.id)));
  protected readonly filtered = computed(() => {
    const q = foldText(this.query());
    const list = this.countries();
    return q ? list.filter((c) => foldText(c.name).includes(q) || foldText(c.nameEn).includes(q)) : list;
  });

  protected toggle(id: string): void {
    this.value.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected selectAll(): void {
    this.value.set(this.countries().map((c) => c.id));
  }

  protected clear(): void {
    this.value.set([]);
  }
}
