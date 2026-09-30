import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { ApiError } from '../../core/models/api-response.model';
import { apiErrorToMessage } from '../../core/utils/api-error.util';
import { BusySet } from '../../core/utils/busy-set';
import { Client } from './clients.models';
import { ClientsStore } from './clients.store';

/**
 * Ban / unban flows (both confirmed) shared by the customers list and detail
 * pages. Each resolves to the updated record, or `null` when cancelled or failed.
 */
@Injectable({ providedIn: 'root' })
export class ClientActionsService {
  private readonly store = inject(ClientsStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly busySet = new BusySet();

  readonly busy = this.busySet.ids;

  async ban(c: Client): Promise<Client | null> {
    const ok = await this.dialog.confirm({
      title: 'حظر العميل',
      message: `سيتم حظر "${c.fullName}" ومنعه من استخدام التطبيق وإجراء الحجوزات حتى ترفع الحظر عنه.`,
      confirmText: 'حظر الحساب',
      type: 'danger',
    });
    if (!ok) return null;
    return this.run(c, this.store.ban(c), `تم حظر "${c.fullName}"`, 'تعذّر حظر العميل', 'warning');
  }

  async unban(c: Client): Promise<Client | null> {
    const ok = await this.dialog.confirm({
      title: 'رفع الحظر عن العميل',
      message: `سيتمكن "${c.fullName}" من استخدام التطبيق وإجراء الحجوزات مرة أخرى. هل تريد المتابعة؟`,
      confirmText: 'رفع الحظر',
      type: 'info',
    });
    if (!ok) return null;
    return this.run(c, this.store.unban(c), `تم رفع الحظر عن "${c.fullName}"`, 'تعذّر رفع الحظر');
  }

  toggleBan(c: Client): Promise<Client | null> {
    return c.banned ? this.unban(c) : this.ban(c);
  }

  private async run(
    c: Client,
    request: Observable<Client>,
    success: string,
    failure: string,
    tone: 'success' | 'warning' = 'success',
  ): Promise<Client | null> {
    if (this.busySet.has(c.id)) return null;
    try {
      const updated = await firstValueFrom(this.busySet.track(c.id, request));
      this.toast[tone](success);
      return updated;
    } catch (err) {
      this.toast.error(apiErrorToMessage(err as ApiError, failure), { title: `"${c.fullName}"` });
      return null;
    }
  }
}
