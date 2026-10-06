import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { DialogService } from '../services/dialog.service';

/** Implemented by routed components that hold edits not yet saved. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Asks before leaving a page with unsaved edits. Pair it with a
 * `beforeunload` handler in the component for tab close / reload.
 *
 *   { path: 'x', component: X, canDeactivate: [unsavedChangesGuard] }
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component?.hasUnsavedChanges()) return true;
  return inject(DialogService).confirm({
    title: 'تغييرات غير محفوظة',
    message: 'لديك تعديلات لم تُحفظ بعد، وستفقدها إذا غادرت الصفحة. هل تريد المغادرة؟',
    confirmText: 'مغادرة دون حفظ',
    cancelText: 'البقاء في الصفحة',
    type: 'warning',
  });
};
