import { Injectable, inject } from '@angular/core';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { PEOPLE_CONFIG } from './people.config';
import { Person } from './people.models';
import { PeopleStore } from './people.store';

/**
 * Activation / deletion flows shared by the list and detail pages.
 * "Blocking" an account is simply deactivating it.
 */
@Injectable({ providedIn: 'root' })
export class PeopleActionsService {
  private readonly store = inject(PeopleStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  async toggleActive(p: Person): Promise<void> {
    if (p.status === 'inactive') {
      this.store.setStatus(p.kind, p.id, 'active');
      this.toast.success(`تم تفعيل حساب ${p.name}`);
      return;
    }
    const ok = await this.dialog.confirm({
      title: 'إيقاف الحساب',
      message: `سيتم إيقاف حساب "${p.name}" ولن يتمكن من استخدام التطبيق حتى تعيد تفعيله. هل تريد المتابعة؟`,
      confirmText: 'إيقاف الحساب',
      type: 'warning',
    });
    if (!ok) return;
    this.store.setStatus(p.kind, p.id, 'inactive');
    this.toast.warning(`تم إيقاف حساب ${p.name}`);
  }

  /** Resolves `true` when the record was deleted. */
  async remove(p: Person): Promise<boolean> {
    const singular = PEOPLE_CONFIG[p.kind].singular;
    const ok = await this.dialog.confirm({
      title: `حذف ال${singular}`,
      message: `سيتم حذف "${p.name}" وجميع بياناته نهائيًا ولا يمكن التراجع عن هذا الإجراء.`,
      confirmText: 'حذف نهائي',
      type: 'danger',
    });
    if (!ok) return false;
    this.store.remove(p.kind, p.id);
    this.toast.success(`تم حذف ${p.name} بنجاح`);
    return true;
  }
}
