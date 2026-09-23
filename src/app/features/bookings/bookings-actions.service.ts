import { Injectable, inject } from '@angular/core';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { BookingRecord, BookingStatus } from './bookings.models';
import { BookingsStore } from './bookings.store';

/** Confirm-then-mutate booking flows shared by the list and detail pages. */
@Injectable({ providedIn: 'root' })
export class BookingsActionsService {
  private readonly store = inject(BookingsStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  /** The next forward step for a booking, or `null` when it's final. */
  nextStep(b: BookingRecord): { status: BookingStatus; label: string; icon: 'activity' | 'check-circle' } | null {
    if (b.status === 'scheduled') return { status: 'in_progress', label: 'بدء الجلسة', icon: 'activity' };
    if (b.status === 'in_progress') return { status: 'completed', label: 'إنهاء الجلسة', icon: 'check-circle' };
    return null;
  }

  advance(b: BookingRecord): void {
    const step = this.nextStep(b);
    if (!step) return;
    this.store.setStatus(b.id, step.status);
    this.toast.success(step.status === 'completed' ? `تم إكمال الحجز ${b.id}` : `بدأت جلسة الحجز ${b.id}`);
  }

  async cancel(b: BookingRecord): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'إلغاء الحجز',
      message:
        `سيتم إلغاء الحجز ${b.id} الخاص بـ "${b.customerName}" وإشعار العميل والفني.` +
        (b.paymentStatus === 'paid' ? ' سيتم استرداد المبلغ المدفوع تلقائيًا.' : ''),
      confirmText: 'نعم، إلغاء الحجز',
      cancelText: 'تراجع',
      type: 'warning',
    });
    if (!ok) return;
    this.store.setStatus(b.id, 'cancelled');
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
