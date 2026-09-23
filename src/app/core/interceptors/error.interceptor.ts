import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/services/auth.service';
import { ToastService } from '../services/toast.service';
import { SKIP_ERROR_TOAST } from '../http/http-context.tokens';
import { ApiError, ApiFieldErrors } from '../models/api-response.model';
import { AUTH_ENDPOINTS } from '../auth/auth.config';
import { environment } from '../../../environments/environment';

/**
 * Normalizes every HTTP failure into an `ApiError` and (unless the caller
 * opted out) surfaces a toast. Components see `ApiError` in their error
 * branch — never the raw `HttpErrorResponse`.
 *
 * Every error is also logged to the console — silencing it would make
 * "Failed to fetch" / CORS / network errors invisible during development
 * and leave us blind in production diagnostics.
 *
 * If your app needs to localize/translate backend error strings, add that
 * as a pluggable step inside `resolveMessage()` below rather than scattering
 * translation calls through feature code.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const apiError = normalizeError(err);
      logError(req.method, req.url, err, apiError);

      // Suppress toasts when the user is not authenticated — covers in-flight
      // requests that fail after an explicit logout (the token was just cleared).
      const silent =
        req.context.get(SKIP_ERROR_TOAST) ||
        req.url.includes(AUTH_ENDPOINTS.refresh) ||
        !auth.isAuthenticated();

      if (!silent) toast.error(apiError.message);

      return throwError(() => apiError);
    })
  );
};

function normalizeError(err: HttpErrorResponse): ApiError {
  const status = err.status ?? 0;
  const body = err.error ?? {};

  const rawMessage: string =
    body?.message || body?.error || body?.detail || body?.title || '';
  const message = rawMessage.trim() || statusMessage(status, err);

  const fieldErrors: ApiFieldErrors | undefined =
    body?.errors && typeof body.errors === 'object' ? body.errors : undefined;

  return {
    status,
    code: body?.code,
    message,
    fieldErrors,
    raw: body,
  };
}

function statusMessage(status: number, err: HttpErrorResponse): string {
  if (status === 0) {
    // Browser blocked the request before it could complete — most commonly
    // CORS or DNS/network failure. The browser hides the real cause for
    // security reasons; the only readable hint is `err.message`.
    return err.message?.includes('Failed to fetch')
      ? 'تعذّر الاتصال بالخادم (مشكلة في الشبكة أو CORS). راجع وحدة التحكم لمزيد من التفاصيل.'
      : 'تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.';
  }

  const messages: Record<number, string> = {
    400: 'طلب غير صالح',
    401: 'بيانات الدخول غير صحيحة',
    403: 'ليس لديك صلاحية لتنفيذ هذا الإجراء',
    404: 'العنصر المطلوب غير موجود',
    409: 'حدث تعارض في البيانات',
    422: 'البيانات المُدخلة غير صالحة',
    429: 'طلبات كثيرة جدًا، يرجى الانتظار قليلًا',
    500: 'خطأ في الخادم، يرجى المحاولة لاحقًا',
    502: 'الخدمة غير متاحة مؤقتًا',
    503: 'الخدمة غير متاحة مؤقتًا',
    504: 'انتهت مهلة الاتصال بالخادم',
  };

  return messages[status] ?? `حدث خطأ غير متوقع (${status})`;
}

function logError(
  method: string,
  url: string,
  err: HttpErrorResponse,
  apiError: ApiError,
): void {
  // Always group + log in dev. In production we still log a single line so
  // users can copy/paste a useful trace into bug reports.
  if (environment.production) {
    console.error(
      `[HTTP ${apiError.status}] ${method} ${url} — ${apiError.message}`,
    );
    return;
  }

  /* eslint-disable no-console */
  const groupLabel = `[HTTP ${apiError.status || 'NETWORK'}] ${method} ${url}`;
  if (typeof console.groupCollapsed === 'function') {
    console.groupCollapsed(groupLabel);
  } else {
    console.error(groupLabel);
  }
  console.error('Message :', apiError.message);
  console.error('Status  :', err.status, err.statusText || '(no statusText)');
  if (apiError.fieldErrors) console.error('Fields  :', apiError.fieldErrors);
  if (err.error) console.error('Body    :', err.error);
  console.error('Raw     :', err);
  if (err.status === 0) {
    console.warn(
      'Browser-level network/CORS failure. Likely causes:\n' +
        '  • Backend CORS rejected the origin (run via dev proxy)\n' +
        '  • DNS / connection failure\n' +
        '  • Mixed-content (HTTPS page calling HTTP API)\n' +
        '  • Browser/extension blocked the request',
    );
  }
  if (typeof console.groupEnd === 'function') console.groupEnd();
  /* eslint-enable no-console */
}
