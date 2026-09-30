import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { ApiError } from '../../core/models/api-response.model';
import { apiErrorToMessage } from '../../core/utils/api-error.util';
import { BusySet } from '../../core/utils/busy-set';
import { Specialist } from './specialists.models';
import { SpecialistsStore } from './specialists.store';

/**
 * Review / ban flows shared by the technicians list and detail pages:
 * confirmation for the restrictive ones and for lifting a ban, then the
 * request, then feedback.
 * Each resolves to the updated record, or `null` when cancelled or failed.
 */
@Injectable({ providedIn: 'root' })
export class SpecialistActionsService {
  private readonly store = inject(SpecialistsStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly busySet = new BusySet();

  readonly busy = this.busySet.ids;

  approve(s: Specialist): Promise<Specialist | null> {
    return this.run(s, this.store.approve(s), `تم اعتماد "${s.fullName}" ويمكنه الآن استقبال الطلبات`, 'تعذّر اعتماد الفني');
  }

  async reject(s: Specialist): Promise<Specialist | null> {
    const revoking = s.status === 'approved';
    const ok = await this.dialog.confirm({
      title: revoking ? 'إلغاء اعتماد الفني' : 'رفض طلب الانضمام',
      message: revoking
        ? `سيتم رفض "${s.fullName}" وإيقاف ظهوره للعملاء. يمكنك إعادة اعتماده لاحقًا.`
        : `سيتم رفض طلب انضمام "${s.fullName}" ولن يتمكن من استقبال الطلبات. يمكنك اعتماده لاحقًا.`,
      confirmText: revoking ? 'إلغاء الاعتماد' : 'رفض الطلب',
      type: 'warning',
    });
    if (!ok) return null;
    return this.run(s, this.store.reject(s), `تم رفض "${s.fullName}"`, 'تعذّر رفض الفني', 'warning');
  }

  async ban(s: Specialist): Promise<Specialist | null> {
    const ok = await this.dialog.confirm({
      title: 'حظر الفني',
      message: `سيتم حظر "${s.fullName}" ومنعه من استخدام التطبيق حتى ترفع الحظر عنه.`,
      confirmText: 'حظر الحساب',
      type: 'danger',
    });
    if (!ok) return null;
    return this.run(s, this.store.ban(s), `تم حظر "${s.fullName}"`, 'تعذّر حظر الفني', 'warning');
  }

  async unban(s: Specialist): Promise<Specialist | null> {
    const ok = await this.dialog.confirm({
      title: 'رفع الحظر عن الفني',
      message: `سيتمكن "${s.fullName}" من استخدام التطبيق واستقبال الطلبات مرة أخرى. هل تريد المتابعة؟`,
      confirmText: 'رفع الحظر',
      type: 'info',
    });
    if (!ok) return null;
    return this.run(s, this.store.unban(s), `تم رفع الحظر عن "${s.fullName}"`, 'تعذّر رفع الحظر');
  }

  toggleBan(s: Specialist): Promise<Specialist | null> {
    return s.banned ? this.unban(s) : this.ban(s);
  }

  private async run(
    s: Specialist,
    request: Observable<Specialist>,
    success: string,
    failure: string,
    tone: 'success' | 'warning' = 'success',
  ): Promise<Specialist | null> {
    if (this.busySet.has(s.id)) return null;
    try {
      const updated = await firstValueFrom(this.busySet.track(s.id, request));
      this.toast[tone](success);
      return updated;
    } catch (err) {
      this.toast.error(apiErrorToMessage(err as ApiError, failure), { title: `"${s.fullName}"` });
      return null;
    }
  }
}
