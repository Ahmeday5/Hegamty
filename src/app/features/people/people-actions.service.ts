import { Injectable, inject } from '@angular/core';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { PEOPLE_CONFIG } from './people.config';
import { Person } from './people.models';
import { PeopleStore } from './people.store';

/**
 * Confirm-then-mutate flows (block / unblock / delete) shared by the list
 * and detail pages so both always show the same wording and toasts.
 */
@Injectable({ providedIn: 'root' })
export class PeopleActionsService {
  private readonly store = inject(PeopleStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  async toggleBlock(p: Person): Promise<void> {
    const singular = PEOPLE_CONFIG[p.kind].singular;
    const blocking = p.status !== 'blocked';
    const ok = await this.dialog.confirm(
      blocking
        ? {
            title: `حظر ال${singular}`,
            message: `سيتم إيقاف حساب "${p.name}" ومنعه من استخدام التطبيق حتى يتم إلغاء الحظر. هل تريد المتابعة؟`,
            confirmText: 'نعم، حظر',
            type: 'warning',
          }
        : {
            title: 'إلغاء الحظر',
            message: `سيتم إعادة تفعيل حساب "${p.name}". هل تريد المتابعة؟`,
            confirmText: 'إلغاء الحظر',
            type: 'info',
          },
    );
    if (!ok) return;
    this.store.setStatus(p.kind, p.id, blocking ? 'blocked' : 'active');
    if (blocking) this.toast.warning(`تم حظر ${p.name}`);
    else this.toast.success(`تم إلغاء حظر ${p.name} وإعادة تفعيل الحساب`);
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
