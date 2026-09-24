import { Injectable, inject } from '@angular/core';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { BookingRecord } from './bookings.models';
import { BookingsStore } from './bookings.store';

/** Admin-side booking interventions shared by the list and detail pages. */
@Injectable({ providedIn: 'root' })
export class BookingsActionsService {
  private readonly store = inject(BookingsStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  canCancel(b: BookingRecord): boolean {
    return b.status === 'scheduled' || b.status === 'in_progress';
  }

  async cancel(b: BookingRecord): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'إلغاء الحجز',
      message: `سيتم إلغاء الحجز ${b.id} الخاص بـ "${b.customerName}" وإشعار العميل والفني عبر التطبيق.`,
      confirmText: 'نعم، إلغاء الحجز',
      cancelText: 'تراجع',
      type: 'warning',
    });
    if (!ok) return;
    this.store.cancel(b.id);
    this.toast.warning(`تم إلغاء الحجز ${b.id}`);
  }

  /** Resolves `true` when the booking was deleted. */
  async remove(b: BookingRecord): Promise<boolean> {
    const ok = await this.dialog.confirm({
      title: 'حذف الحجز',
      message: `سيتم حذف الحجز ${b.id} نهائيًا من السجلات ولا يمكن التراجع عن هذا الإجراء.`,
      confirmText: 'حذف نهائي',
      type: 'danger',
    });
    if (!ok) return false;
    this.store.remove(b.id);
    this.toast.success(`تم حذف الحجز ${b.id}`);
    return true;
  }
}
