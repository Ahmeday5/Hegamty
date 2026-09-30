/** What a single search box maps to on the accounts endpoints (`name` / `phone`). */
export interface AccountSearch {
  name: string | null;
  phone: string | null;
}

/** Digits with the separators people paste from contacts: `+20 102-370 2370`. */
const PHONE_LIKE = /^\+?[\d\s()-]+$/;

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII. */
function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * One box searches by name *or* phone: input made of digits (in any script)
 * is sent as `phone` without separators, anything else as `name`.
 */
export function parseAccountSearch(raw: string): AccountSearch {
  const term = toLatinDigits(raw.trim());
  if (!term) return { name: null, phone: null };
  if (PHONE_LIKE.test(term) && /\d/.test(term)) return { name: null, phone: term.replace(/[^\d+]/g, '') };
  return { name: term.replace(/\s+/g, ' '), phone: null };
}
