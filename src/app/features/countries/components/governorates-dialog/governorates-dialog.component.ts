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
import { DialogService } from '../../../../core/services/dialog.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { CountriesStore } from '../../countries.store';
import { Governorate } from '../../countries.models';
import { CountryFlagComponent } from '../../country-flag.component';
import { countDivisions } from '../../country-registry';
import { DivisionCountPipe } from '../../country.pipes';

/**
 * Browse a country's governorates (or regions / states — the wording follows
 * the country), append new ones and delete existing ones. Reads the country live from the store,
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
  private readonly dialog = inject(DialogService);
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
  /** Ids with an in-flight delete. */
  protected readonly removing = signal<ReadonlySet<string>>(new Set());

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

  protected readonly busy = computed(() => this.saving() || this.removing().size > 0);

  protected close(): void {
    if (!this.busy()) this.closed.emit();
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

  protected async remove(g: Governorate): Promise<void> {
    const c = this.country();
    if (!c || this.removing().has(g.id)) return;
    const ok = await this.dialog.confirm({
      title: `حذف ${c.division.singular} "${g.name}"`,
      message: `سيتم حذف "${g.name}" من ${c.division.plural} ${c.name} نهائيًا. لن يكتمل الحذف إذا كانت مرتبطة بعناوين أو حسابات مسجّلة.`,
      confirmText: 'حذف نهائي',
      type: 'danger',
    });
    if (!ok) return;

    this.setRemoving(g.id, true);
    this.store
      .removeGovernorate(c.id, g.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.setRemoving(g.id, false);
          this.toast.success(`تم حذف "${g.name}" من ${c.name}`);
        },
        error: (err: ApiError) => {
          this.setRemoving(g.id, false);
          const message =
            err?.status === 409
              ? `"${g.name}" مرتبطة ببيانات أخرى (عناوين أو حسابات)، لذلك لا يمكن حذفها حاليًا.`
              : apiErrorToMessage(err, 'حدث خطأ أثناء الحذف، حاول مرة أخرى.');
          this.toast.error(message, { title: `تعذّر حذف "${g.name}"` });
        },
      });
  }

  private setRemoving(id: string, on: boolean): void {
    this.removing.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private resetAdd(): void {
    this.adding.set(false);
    this.drafts.set([]);
    this.error.set(null);
    this.submitted.set(false);
  }
}
