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
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ImageUploadComponent } from '../../../../shared/components/image-upload/image-upload.component';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { CountryMultiSelectComponent } from '../../../countries/components/country-multi-select/country-multi-select.component';
import { CategoriesStore } from '../../categories.store';
import { CategoryDraft, ServiceCategory } from '../../services.models';

const NAME_MAX = 60;
const DESC_MAX = 250;
const ICON_MAX_MB = 2;

/**
 * Add / edit a services section: name, description, icon image, the
 * countries it's offered in, and visibility — with a live preview of its
 * app card. Sent as multipart; on edit the image is only uploaded if changed.
 */
@Component({
  selector: 'app-category-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, IconComponent, ImageUploadComponent, CountryMultiSelectComponent],
  templateUrl: './category-form.component.html',
  styleUrl: './category-form.component.scss',
})
export class CategoryFormComponent {
  readonly open = input.required<boolean>();
  readonly category = input<ServiceCategory | null>(null);
  /** Pre-selected country for a new section (the header's country scope). */
  readonly countryId = input<string | null>(null);
  readonly closed = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(CategoriesStore);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly nameMax = NAME_MAX;
  protected readonly descMax = DESC_MAX;
  protected readonly iconMaxMb = ICON_MAX_MB;
  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly submitted = signal(false);

  // Non-text fields live in signals: a File and an id list don't belong in a text form model.
  protected readonly iconFile = signal<File | null>(null);
  protected readonly countryIds = signal<string[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(NAME_MAX)]],
    description: ['', Validators.maxLength(DESC_MAX)],
    active: [true],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly isEdit = computed(() => !!this.category());
  protected readonly title = computed(() => (this.category() ? `تعديل قسم "${this.category()!.name}"` : 'إضافة قسم جديد'));
  protected readonly currentIconUrl = computed(() => this.category()?.iconUrl ?? null);
  protected readonly previewIconUrl = signal<string | null>(null);

  protected readonly preview = computed(() => {
    const v = this.value();
    return {
      name: v.name?.trim() || 'اسم القسم',
      description: v.description?.trim() || 'وصف مختصر يظهر للعميل أسفل اسم القسم',
      active: v.active ?? true,
    };
  });
  protected readonly descLength = computed(() => this.value().description?.length ?? 0);

  /** New sections need an icon; existing ones keep theirs unless replaced. */
  protected readonly iconMissing = computed(() => this.submitted() && !this.iconFile() && !this.currentIconUrl());
  protected readonly countriesMissing = computed(() => this.submitted() && !this.countryIds().length);

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        const c = this.category();
        const scopedCountry = this.countryId();
        untracked(() => {
          this.saving.set(false);
          this.submitted.set(false);
          this.serverError.set(null);
          this.iconFile.set(null);
          this.countryIds.set(c ? c.countries.map((x) => x.id) : scopedCountry ? [scopedCountry] : []);
          this.form.reset({ name: c?.name ?? '', description: c?.description ?? '', active: c?.active ?? true });
        });
      },
      { allowSignalWrites: true },
    );

    // Preview the picked file (or the saved icon) in the app-card mock.
    effect(
      (onCleanup) => {
        const f = this.iconFile();
        if (!f) {
          this.previewIconUrl.set(this.currentIconUrl());
          return;
        }
        const url = URL.createObjectURL(f);
        this.previewIconUrl.set(url);
        onCleanup(() => URL.revokeObjectURL(url));
      },
      { allowSignalWrites: true },
    );
  }

  protected invalid(name: 'name' | 'description'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected toggleActive(): void {
    this.form.controls.active.setValue(!this.form.controls.active.value);
  }

  protected close(): void {
    if (!this.saving()) this.closed.emit();
  }

  protected submit(): void {
    if (this.saving()) return;
    this.submitted.set(true);
    this.serverError.set(null);
    if (this.form.invalid || this.iconMissing() || this.countriesMissing()) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const draft: CategoryDraft = {
      name: v.name.trim(),
      description: v.description.trim(),
      active: v.active,
      countryIds: this.countryIds(),
      iconFile: this.iconFile(),
    };
    const existing = this.category();
    const request$: Observable<ServiceCategory> = existing ? this.store.update(existing.id, draft) : this.store.create(draft);

    this.saving.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (c) => {
        this.saving.set(false);
        this.toast.success(existing ? `تم تحديث قسم "${c.name}"` : `تمت إضافة قسم "${c.name}"`);
        this.closed.emit();
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.serverError.set(apiErrorToMessage(err, existing ? 'تعذّر حفظ التعديلات' : 'تعذّرت إضافة القسم'));
      },
    });
  }
}
