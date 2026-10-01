import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { AccountKind, AccountOptionsService } from '../../account-options.service';
import { AccountLocationFilter, locationKey } from '../../account-profile';

type Load = { state: 'idle' | 'loading' | 'error' } | { state: 'ready'; options: SearchableSelectOption[] };

const LABELS: Record<AccountKind, { pick: string; search: string; none: string }> = {
  client: { pick: 'كل العملاء', search: 'ابحث باسم العميل أو رقم الجوال…', none: 'لا يوجد عملاء في هذه المنطقة' },
  specialist: { pick: 'كل الفنيين', search: 'ابحث باسم الفني أو رقم الجوال…', none: 'لا يوجد فنيون في هذه المنطقة' },
};

/**
 * Searchable pick-list of the customers / technicians in a country (and
 * governorate). Needs a country — the full account base is too large to list.
 * A selected account outside the loaded list (e.g. from a profile link)
 * still shows, as `#id`, so it can be seen and cleared.
 */
@Component({
  selector: 'app-account-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SearchableSelectComponent],
  template: `
    <app-searchable-select [compact]="true" [options]="options()" [ngModel]="value()" (ngModelChange)="emit($event)"
      [placeholder]="placeholder()" [searchPlaceholder]="labels().search" [isDisabled]="disabled()" [ariaLabel]="ariaLabel()"
      [attr.title]="load().state === 'error' ? 'تعذّر تحميل القائمة — غيّر الفلتر أو حدّث الصفحة' : null" />
  `,
  styles: [`:host { display: block; min-width: 0; }`],
})
export class AccountPickerComponent {
  readonly kind = input.required<AccountKind>();
  readonly location = input.required<AccountLocationFilter>();
  readonly value = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly valueChange = output<string | null>();

  private readonly source = inject(AccountOptionsService);

  protected readonly labels = computed(() => LABELS[this.kind()]);

  protected readonly load = toSignal(
    toObservable(computed(() => ({ kind: this.kind(), location: this.location() }))).pipe(
      distinctUntilChanged((a, b) => a.kind === b.kind && locationKey(a.location) === locationKey(b.location)),
      switchMap(({ kind, location }): Observable<Load> =>
        location.countryId
          ? this.source.options(kind, location).pipe(
              map((options): Load => ({ state: 'ready', options })),
              startWith<Load>({ state: 'loading' }),
              catchError(() => of<Load>({ state: 'error' })),
            )
          : of<Load>({ state: 'idle' }),
      ),
    ),
    { initialValue: { state: 'idle' } as Load },
  );

  protected readonly options = computed<SearchableSelectOption[]>(() => {
    const l = this.load();
    const list = l.state === 'ready' ? l.options : [];
    const id = this.value();
    return id && !list.some((o) => String(o.value) === id) ? [{ value: id, label: `#${id}`, hint: 'خارج المنطقة المختارة' }, ...list] : list;
  });

  /** Stays enabled with a selection, so it can always be cleared. */
  protected readonly disabled = computed(() => !this.value() && (this.load().state !== 'ready' || !this.options().length));

  protected readonly placeholder = computed(() => {
    switch (this.load().state) {
      case 'idle':
        return 'اختر الدولة أولًا';
      case 'loading':
        return 'جارٍ التحميل…';
      case 'error':
        return 'تعذّر تحميل القائمة';
      default:
        return this.options().length ? this.labels().pick : this.labels().none;
    }
  });

  protected emit(value: string | number | null): void {
    this.valueChange.emit(value === null || value === '' ? null : String(value));
  }
}
