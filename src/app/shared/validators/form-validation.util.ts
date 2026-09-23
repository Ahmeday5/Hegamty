import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Maps a control's first failing validator into a human-readable message.
 *
 * Use via `<app-form-error [control]="form.controls.email" label="Email" />`
 * or directly: `firstError(ctrl, 'Field')`.
 *
 * Order matters — `required` is checked first so an empty field never gets
 * a "wrong format" message.
 */
export function firstError(
  control: AbstractControl | null | undefined,
  label: string,
  custom?: Record<string, (e: unknown) => string>,
): string | null {
  if (!control) return null;
  if (!(control.dirty || control.touched)) return null;
  if (!control.errors) return null;

  return resolveMessage(control.errors, label, custom);
}

/** Same as `firstError` but ignores touched/dirty — useful for forced display. */
export function firstErrorAlways(
  control: AbstractControl | null | undefined,
  label: string,
  custom?: Record<string, (e: unknown) => string>,
): string | null {
  if (!control?.errors) return null;
  return resolveMessage(control.errors, label, custom);
}

function resolveMessage(
  errors: ValidationErrors,
  label: string,
  custom?: Record<string, (e: unknown) => string>,
): string {
  // Custom keys always win.
  if (custom) {
    for (const key of Object.keys(custom)) {
      if (errors[key] !== undefined) return custom[key](errors[key]);
    }
  }

  // Messages are phrased around "حقل/قيمة <label>" so they read correctly
  // regardless of the label's grammatical gender.
  if (errors['required'] !== undefined) {
    return `حقل ${label} مطلوب`;
  }
  if (errors['email'] !== undefined) {
    return `صيغة ${label} غير صحيحة`;
  }
  if (errors['minlength']) {
    const req = errors['minlength'].requiredLength;
    return `يجب ألا يقل ${label} عن ${req} أحرف`;
  }
  if (errors['maxlength']) {
    const req = errors['maxlength'].requiredLength;
    return `يجب ألا يزيد ${label} عن ${req} حرفًا`;
  }
  if (errors['min'] !== undefined) {
    return `يجب أن تكون قيمة ${label} ${errors['min'].min} أو أكثر`;
  }
  if (errors['max'] !== undefined) {
    return `يجب أن تكون قيمة ${label} ${errors['max'].max} أو أقل`;
  }
  if (errors['pattern'] !== undefined) {
    return `قيمة ${label} غير صالحة`;
  }
  if (errors['mismatch'] !== undefined) {
    return `حقل ${label} غير متطابق`;
  }
  if (errors['strongPassword'] !== undefined) {
    return 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل وتحتوي على حرف كبير وحرف صغير ورقم';
  }
  if (errors['phone'] !== undefined) {
    return 'رقم الهاتف غير صالح';
  }

  // Unknown validator — show the raw key as a graceful fallback.
  const firstKey = Object.keys(errors)[0];
  const value = errors[firstKey];
  if (typeof value === 'string') return value;
  return `قيمة ${label} غير صالحة`;
}

// ─────────────────────── reusable validators ───────────────────────

/** Requires at least one uppercase, one lowercase, one digit, min length 8. */
export function strongPasswordValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string | null;
    if (!value) return null;
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasDigit = /\d/.test(value);
    const longEnough = value.length >= 8;
    return hasUpper && hasLower && hasDigit && longEnough
      ? null
      : { strongPassword: true };
  };
}

/** Basic phone number validator — digits, spaces, `+`, `-`, `()`, 7–15 digits total. */
export function phoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string | null;
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    const pattern = /^[\d+\-()\s]+$/;
    return pattern.test(value) && digits.length >= 7 && digits.length <= 15
      ? null
      : { phone: true };
  };
}

/**
 * Cross-field validator: requires `controlName` and `matchControlName` to be
 * equal. Attach to the FormGroup (not an individual control) and read the
 * `mismatch` error off `matchControlName` — e.g.
 *
 *   this.fb.group({ password: [...], confirmPassword: [...] }, {
 *     validators: matchFieldsValidator('password', 'confirmPassword'),
 *   });
 */
export function matchFieldsValidator(
  controlName: string,
  matchControlName: string,
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const control = group.get(controlName);
    const matchControl = group.get(matchControlName);
    if (!control || !matchControl) return null;

    if (matchControl.value !== control.value) {
      matchControl.setErrors({ ...matchControl.errors, mismatch: true });
      return { mismatch: true };
    }

    if (matchControl.errors) {
      const { mismatch, ...rest } = matchControl.errors;
      matchControl.setErrors(Object.keys(rest).length ? rest : null);
    }
    return null;
  };
}
