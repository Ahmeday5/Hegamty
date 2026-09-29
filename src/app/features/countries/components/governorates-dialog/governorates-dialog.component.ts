import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { TagInputComponent } from '../../../../shared/components/tag-input/tag-input.component';
import { foldText } from '../../../../shared/utils/text-normalize.util';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { CountriesStore } from '../../countries.store';
import { CountryFlagComponent } from '../../country-flag.component';
import { countDivisions } from '../../country-registry';
import { DivisionCountPipe } from '../../country.pipes';

/**
 * Browse a country's governorates (or regions / states — the wording follows
 * the country) and append new ones. Reads the country live from the store,
 * so the list refreshes as soon as the add request returns.
 */
@Component({
  selector: 'app-governorates-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, IconComponent, TagInputComponent, CountryFlagComponent, DivisionCountPipe],
  templateUrl: './governorates-dialog.component.html',
  styleUrl: './governorates-dialog.component.scss',
})
export class GovernoratesDialogComponent {
  readonly open = input.required<boolean>();
  readonly countryId = input<string | null>(null);
  /** Open straight into the "add" panel (from the card's quick action). */
  readonly startAdding = input(false);
  readonly closed = output<void>();

  private readonly store = inject(CountriesStore);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tagInput = viewChild(TagInputComponent);

  protected readonly country = computed(() => this.store.byId(this.countryId()));
  protected readonly title = computed(() => {
    const c = this.country();
    return c ? `${c.division.plural} ${c.name}` : '';
  });

  protected readonly query = signal('');
  protected readonly adding = signal(false);
  protected readonly drafts = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);
  /** Ids returned by the last add — highlighted in the list. */
  protected readonly freshIds = signal<ReadonlySet<string>>(new Set());

  protected readonly existingNames = computed(() => this.country()?.governorates.map((g) => g.name) ?? []);

  protected readonly filtered = computed(() => {
    const list = this.country()?.governorates ?? [];
    const q = foldText(this.query());
    if (!q) return list;
    return list.filter((g) => foldText(g.name).includes(q) || foldText(g.nameEn).includes(q));
  });

  protected readonly draftsSummary = computed(() => {
    const c = this.country();
    return c ? countDivisions(this.drafts().length, c.division) : '';
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.countryId();
        const startAdding = this.startAdding();
        untracked(() => {
          this.query.set('');
          this.freshIds.set(new Set());
          this.resetAdd();
          this.adding.set(startAdding);
          if (startAdding) queueMicrotask(() => this.tagInput()?.focus());
        });
      },
      { allowSignalWrites: true },
    );
  }

  protected close(): void {
    if (!this.saving()) this.closed.emit();
  }

  protected startAdd(): void {
    this.adding.set(true);
    this.error.set(null);
    queueMicrotask(() => this.tagInput()?.focus());
  }

  protected cancelAdd(): void {
    if (this.saving()) return;
    this.resetAdd();
  }

  protected save(): void {
    const c = this.country();
    if (!c || this.saving()) return;
    this.tagInput()?.commit();
    this.submitted.set(true);
    this.error.set(null);
    const names = this.drafts();
    if (!names.length) return;

    const before = new Set(c.governorates.map((g) => g.id));
    this.saving.set(true);
    this.store
      .addGovernorates(c.id, names)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.freshIds.set(new Set(updated.governorates.filter((g) => !before.has(g.id)).map((g) => g.id)));
          this.query.set('');
          this.resetAdd();
          this.toast.success(`تمت إضافة ${countDivisions(names.length, updated.division)} إلى ${updated.name}`);
        },
        error: (err: ApiError) => {
          this.saving.set(false);
          this.error.set(apiErrorToMessage(err, `تعذّرت إضافة ال${c.division.plural}`));
        },
      });
  }

  private resetAdd(): void {
    this.adding.set(false);
    this.drafts.set([]);
    this.error.set(null);
    this.submitted.set(false);
  }
}
