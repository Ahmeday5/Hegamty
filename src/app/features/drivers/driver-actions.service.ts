import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { ApiError } from '../../core/models/api-response.model';
import { apiErrorToMessage } from '../../core/utils/api-error.util';
import { BusySet } from '../../core/utils/busy-set';
import { Driver } from './drivers.models';
import { DriversStore } from './drivers.store';

/**
 * Ban / unban flows (both confirmed) shared by the drivers list and detail
 * pages. Each resolves to the updated record, or `null` when cancelled or failed.
 */
@Injectable({ providedIn: 'root' })
export class DriverActionsService {
  private readonly store = inject(DriversStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly busySet = new BusySet();

  readonly busy = this.busySet.ids;

  async ban(d: Driver): Promise<Driver | null> {
    const ok = await this.dialog.confirm({
      title: 'حظر السائق',
      message: `سيتم حظر "${d.fullName}" ومنعه من استخدام التطبيق واستقبال الرحلات حتى ترفع الحظر عنه.`,
      confirmText: 'حظر الحساب',
      type: 'danger',
    });
    if (!ok) return null;
    return this.run(d, this.store.ban(d), `تم حظر "${d.fullName}"`, 'تعذّر حظر السائق', 'warning');
  }

  async unban(d: Driver): Promise<Driver | null> {
    const ok = await this.dialog.confirm({
      title: 'رفع الحظر عن السائق',
      message: `سيتمكن "${d.fullName}" من استخدام التطبيق واستقبال الرحلات مرة أخرى. هل تريد المتابعة؟`,
      confirmText: 'رفع الحظر',
      type: 'info',
    });
    if (!ok) return null;
    return this.run(d, this.store.unban(d), `تم رفع الحظر عن "${d.fullName}"`, 'تعذّر رفع الحظر');
  }

  toggleBan(d: Driver): Promise<Driver | null> {
    return d.banned ? this.unban(d) : this.ban(d);
  }

  private async run(
    d: Driver,
    request: Observable<Driver>,
    success: string,
    failure: string,
    tone: 'success' | 'warning' = 'success',
  ): Promise<Driver | null> {
    if (this.busySet.has(d.id)) return null;
    try {
      const updated = await firstValueFrom(this.busySet.track(d.id, request));
      this.toast[tone](success);
      return updated;
    } catch (err) {
      this.toast.error(apiErrorToMessage(err as ApiError, failure), { title: `"${d.fullName}"` });
      return null;
    }
  }
}
