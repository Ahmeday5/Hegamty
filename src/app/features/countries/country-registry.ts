import { formatNumber } from '../../shared/utils/format.util';
import { foldText } from '../../shared/utils/text-normalize.util';

/**
 * Static knowledge about the Arab markets the platform targets.
 *
 * The API identifies a country by a numeric id and free-text names only, so
 * everything that depends on *which* country it is — its real flag and what
 * its first-level subdivisions are called locally (Egypt has محافظات, Saudi
 * Arabia مناطق, Algeria ولايات, Libya بلديات …) — is resolved here from the
 * country's English / Arabic name. Unknown countries fall back to a neutral
 * monogram flag and the generic "محافظة" term.
 */

/** How a country calls its first-level administrative divisions. */
export interface DivisionTerm {
  /** e.g. "محافظة" */
  singular: string;
  /** e.g. "محافظتان" */
  dual: string;
  /** e.g. "محافظات" (used for 3–10) */
  plural: string;
  /** Grammatical gender — drives "واحدة" vs "واحد". */
  gender: 'f' | 'm';
}

const term = (singular: string, dual: string, plural: string, gender: 'f' | 'm' = 'f'): DivisionTerm => ({
  singular,
  dual,
  plural,
  gender,
});

const GOVERNORATE = term('محافظة', 'محافظتان', 'محافظات');
const REGION = term('منطقة', 'منطقتان', 'مناطق');
const EMIRATE = term('إمارة', 'إمارتان', 'إمارات');
const STATE = term('ولاية', 'ولايتان', 'ولايات');
const MUNICIPALITY = term('بلدية', 'بلديتان', 'بلديات');
const MOROCCO_REGION = term('جهة', 'جهتان', 'جهات');
const PROVINCE = term('إقليم', 'إقليمان', 'أقاليم', 'm');
const ISLAND = term('جزيرة', 'جزيرتان', 'جزر');

/** Used for any country that isn't in the registry. */
export const DEFAULT_DIVISION: DivisionTerm = GOVERNORATE;

interface KnownCountry {
  /** ISO 3166-1 alpha-2 (upper case) — also the flag asset name. */
  iso: string;
  division: DivisionTerm;
  /** Accepted spellings, matched after `normalize()`. */
  names: readonly string[];
}

const ARAB_COUNTRIES: readonly KnownCountry[] = [
  { iso: 'SA', division: REGION, names: ['Saudi Arabia', 'KSA', 'Kingdom of Saudi Arabia', 'السعودية', 'المملكة العربية السعودية'] },
  { iso: 'EG', division: GOVERNORATE, names: ['Egypt', 'مصر', 'جمهورية مصر العربية'] },
  { iso: 'AE', division: EMIRATE, names: ['United Arab Emirates', 'UAE', 'Emirates', 'الإمارات', 'الإمارات العربية المتحدة'] },
  { iso: 'KW', division: GOVERNORATE, names: ['Kuwait', 'الكويت'] },
  { iso: 'QA', division: MUNICIPALITY, names: ['Qatar', 'قطر'] },
  { iso: 'BH', division: GOVERNORATE, names: ['Bahrain', 'البحرين'] },
  { iso: 'OM', division: GOVERNORATE, names: ['Oman', 'Sultanate of Oman', 'عمان', 'عُمان', 'سلطنة عمان'] },
  { iso: 'JO', division: GOVERNORATE, names: ['Jordan', 'الأردن'] },
  { iso: 'IQ', division: GOVERNORATE, names: ['Iraq', 'العراق'] },
  { iso: 'SY', division: GOVERNORATE, names: ['Syria', 'سوريا', 'سورية'] },
  { iso: 'LB', division: GOVERNORATE, names: ['Lebanon', 'لبنان'] },
  { iso: 'PS', division: GOVERNORATE, names: ['Palestine', 'فلسطين'] },
  { iso: 'YE', division: GOVERNORATE, names: ['Yemen', 'اليمن'] },
  { iso: 'LY', division: MUNICIPALITY, names: ['Libya', 'ليبيا'] },
  { iso: 'TN', division: STATE, names: ['Tunisia', 'تونس'] },
  { iso: 'DZ', division: STATE, names: ['Algeria', 'الجزائر'] },
  { iso: 'MA', division: MOROCCO_REGION, names: ['Morocco', 'المغرب', 'المملكة المغربية'] },
  { iso: 'MR', division: STATE, names: ['Mauritania', 'موريتانيا'] },
  { iso: 'SD', division: STATE, names: ['Sudan', 'السودان'] },
  { iso: 'SO', division: PROVINCE, names: ['Somalia', 'الصومال'] },
  { iso: 'DJ', division: PROVINCE, names: ['Djibouti', 'جيبوتي'] },
  { iso: 'KM', division: ISLAND, names: ['Comoros', 'جزر القمر'] },
];

/** Folded name with spaces/punctuation dropped, so "U.A.E" ≡ "UAE". */
function normalize(value: string): string {
  return foldText(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

const BY_NAME = new Map<string, KnownCountry>(
  ARAB_COUNTRIES.flatMap((c) => c.names.map((n) => [normalize(n), c] as const)),
);

export interface CountryMeta {
  iso: string | null;
  division: DivisionTerm;
}

/** Resolves ISO code + division term from a country's names (English first). */
export function resolveCountryMeta(name: string, nameEn: string): CountryMeta {
  const hit = BY_NAME.get(normalize(nameEn ?? '')) ?? BY_NAME.get(normalize(name ?? ''));
  return hit ? { iso: hit.iso, division: hit.division } : { iso: null, division: DEFAULT_DIVISION };
}

/** Same lookup, for live previews while the admin types a name. */
export function divisionFor(name: string, nameEn = ''): DivisionTerm {
  return resolveCountryMeta(name, nameEn).division;
}

/** Bundled 4:3 SVG flag for a known country. */
export function flagUrl(iso: string): string {
  return `assets/flags/${iso.toLowerCase()}.svg`;
}

/**
 * Arabic count phrase with correct number agreement:
 *   0 → "لا توجد محافظات" · 1 → "محافظة واحدة" · 2 → "محافظتان"
 *   3–10 → "5 محافظات" · 11+ → "27 محافظة"
 */
export function countDivisions(count: number, t: DivisionTerm): string {
  if (count <= 0) return `لا توجد ${t.plural}`;
  if (count === 1) return `${t.singular} ${t.gender === 'f' ? 'واحدة' : 'واحد'}`;
  if (count === 2) return t.dual;
  const n = formatNumber(count);
  const mod = count % 100;
  return mod >= 3 && mod <= 10 ? `${n} ${t.plural}` : `${n} ${t.singular}`;
}
