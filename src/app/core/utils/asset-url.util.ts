import { environment } from '../../../environments/environment';

/** Files uploaded to the backend are served from its origin, not from `/api`. */
const API_ORIGIN = new URL(environment.apiUrl).origin;

/**
 * Turns a file path returned by the API (e.g. `/Images/Sections/Icons/x.png`)
 * into an absolute URL. Absolute, `data:` and `blob:` URLs pass through.
 * Returns `null` for anything that isn't a path — legacy placeholder values
 * such as `"string"` must never become a broken `<img>`.
 */
export function resolveAssetUrl(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (/^(https?:|data:|blob:)/i.test(v)) return v;
  if (!v.startsWith('/')) return null;
  return `${API_ORIGIN}${v}`;
}
