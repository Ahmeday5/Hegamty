import { ApiError } from '../models/api-response.model';

/**
 * Turns an `ApiError` (already normalized by `errorInterceptor`) into a
 * user-facing message. Prefers backend field errors when present so the
 * user sees the actual rule that failed instead of a generic fallback.
 *
 * Usage:
 *
 *   error: (err: ApiError) =>
 *     this.toast.error(apiErrorToMessage(err, 'Failed to create the record')),
 *
 * - Field errors take precedence — they're the most actionable.
 * - Falls back to `err.message` (set by the interceptor from
 *   `body.message || body.error || body.detail || body.title`).
 * - Falls back to the caller's fallback only when both are missing
 *   (e.g. a `0` status with no usable hint).
 *
 * If your backend messages need translation/localization, add that layer
 * here (see the README's "Error message localization" section) instead of
 * scattering translation calls through feature code.
 */
export function apiErrorToMessage(
  err: ApiError | undefined | null,
  fallback: string,
): string {
  if (!err) return fallback;

  const fieldMessage = formatFieldErrors(err.fieldErrors);
  if (fieldMessage) return fieldMessage;

  return err.message?.trim() || fallback;
}

/**
 * Flattens `{ field: string[] | string }` validation errors into a single
 * human-readable line. Returns null when there are no field errors so the
 * caller can fall through to the message/fallback chain.
 */
function formatFieldErrors(
  fieldErrors: ApiError['fieldErrors'],
): string | null {
  if (!fieldErrors) return null;
  const parts: string[] = [];
  for (const value of Object.values(fieldErrors)) {
    if (Array.isArray(value)) parts.push(...value.filter(Boolean));
    else if (typeof value === 'string' && value.trim()) parts.push(value);
  }
  if (parts.length === 0) return null;
  return parts.join(' — ');
}
