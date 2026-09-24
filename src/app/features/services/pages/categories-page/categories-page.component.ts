import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { CategoriesStore } from '../../categories.store';
import { ServicesStore } from '../../services.store';
import { ServiceCategory } from '../../services.models';
import { CountryScopeService } from '../../../countries/country-scope.service';

/** Service categories (shared across countries) with inline add/edit modal. */
@Component({
  selector: 'app-categories-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, IconComponent, ModalComponent, FormErrorComponent, ...FORMAT_PIPES],
  templateUrl: './categories-page.component.html',
  styleUrl: './categories-page.component.scss',
})
export class CategoriesPageComponent {
  private readonly store = inject(CategoriesStore);
  private readonly services = inject(ServicesStore);
  private readonly scope = inject(CountryScopeService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ServiceCategory | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: ['', Validators.maxLength(160)],
    active: [true],
  });

  protected readonly rows = computed(() => {
    const scoped = this.scope.filter(this.services.all());
    return this.store.all().map((c) => {
      const list = scoped.filter((s) => s.categoryId === c.id);
      return {
        category: c,
        services: list.length,
        activeServices: list.filter((s) => s.active).length,
        bookings: list.reduce((a, s) => a + s.bookingsCount, 0),
        names: list.slice(0, 4).map((s) => s.name),
      };
    });
  });

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', description: '', active: true });
    this.saving.set(false);
    this.formOpen.set(true);
  }

  protected openEdit(c: ServiceCategory): void {
    this.editing.set(c);
    this.form.reset({ name: c.name, description: c.description, active: c.active });
    this.saving.set(false);
    this.formOpen.set(true);
  }

  protected invalid(name: 'name' | 'description'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected toggleFormActive(): void {
    this.form.controls.active.setValue(!this.form.controls.active.value);
  }

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const draft = { name: v.name.trim(), description: v.description.trim(), active: v.active };
    this.saving.set(true);
    setTimeout(() => {
      const existing = this.editing();
      if (existing) {
        this.store.update(existing.id, draft);
        this.toast.success(`تم تحديث تصنيف "${draft.name}"`);
      } else {
        this.store.create(draft);
        this.toast.success(`تمت إضافة تصنيف "${draft.name}"`);
      }
      this.saving.set(false);
      this.formOpen.set(false);
    }, 400);
  }

  protected toggleActive(c: ServiceCategory): void {
    this.store.update(c.id, { active: !c.active });
    if (c.active) this.toast.warning(`تم إيقاف تصنيف "${c.name}" وإخفاء خدماته من التطبيق`);
    else this.toast.success(`تم تفعيل تصنيف "${c.name}"`);
  }

  protected async remove(c: ServiceCategory): Promise<void> {
    const count = this.services.countInCategory(c.id);
    if (count) {
      this.toast.error(`لا يمكن حذف "${c.name}" لأنه يحتوي على ${count} خدمة. انقل الخدمات أو احذفها أولًا.`);
      return;
    }
    const ok = await this.dialog.confirm({
      title: 'حذف التصنيف',
      message: `سيتم حذف تصنيف "${c.name}" نهائيًا.`,
      confirmText: 'حذف',
      type: 'danger',
    });
    if (!ok) return;
    this.store.remove(c.id);
    this.toast.success(`تم حذف تصنيف "${c.name}"`);
  }

  protected openServices(): void {
    this.router.navigate(['/services']);
  }
}
