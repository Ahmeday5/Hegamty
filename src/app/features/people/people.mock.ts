import {
  AppNotification,
  BookingStatus,
  Person,
  PersonBooking,
  PersonHistory,
  PersonKind,
  PersonStatus,
  Review,
} from './people.models';
import { NEW_ACCOUNT_DAYS, PEOPLE_CONFIG, SERVICES, SPECIALTIES } from './people.config';
import { hash, int, pick, rng } from '../../shared/utils/random.util';
import { Country } from '../countries/countries.models';

/**
 * Deterministic mock data (seeded PRNG) — the same id always yields the same
 * person and history, so detail pages survive reloads and deep links while
 * the backend doesn't exist yet. Delete this file once the API is wired.
 */

const MALE: readonly [string, string][] = [
  ['أحمد', 'ahmed'], ['محمد', 'mohammed'], ['عبدالله', 'abdullah'], ['خالد', 'khaled'], ['فهد', 'fahad'],
  ['سعود', 'saud'], ['عمر', 'omar'], ['يوسف', 'yousef'], ['فيصل', 'faisal'], ['تركي', 'turki'],
  ['ماجد', 'majed'], ['نايف', 'naif'], ['سلطان', 'sultan'], ['بندر', 'bandar'], ['عبدالرحمن', 'abdulrahman'],
  ['سلمان', 'salman'], ['ناصر', 'nasser'], ['راشد', 'rashed'], ['زياد', 'ziyad'], ['حمد', 'hamad'],
];
const FEMALE: readonly [string, string][] = [
  ['نورة', 'noura'], ['سارة', 'sara'], ['ريم', 'reem'], ['هند', 'hind'], ['لمى', 'lama'],
  ['العنود', 'alanoud'], ['منيرة', 'munira'], ['أمل', 'amal'], ['دانة', 'dana'], ['جود', 'joud'],
];
const FATHERS = ['محمد', 'عبدالله', 'علي', 'سعد', 'إبراهيم', 'صالح', 'حسن', 'ناصر', 'عبدالعزيز', 'فهد'];
const FAMILIES = [
  'الغامدي', 'القحطاني', 'العتيبي', 'الشهري', 'الدوسري', 'الحربي', 'الزهراني', 'المطيري',
  'السبيعي', 'العنزي', 'الشمري', 'البقمي', 'الأحمدي', 'اليامي', 'الجهني',
];
const DISTRICTS: Record<string, readonly string[]> = {
  SA: ['النزهة', 'العليا', 'الملقا', 'الياسمين', 'الروضة', 'السليمانية', 'النرجس', 'الشاطئ', 'الحمراء', 'الصفا'],
  EG: ['مدينة نصر', 'المعادي', 'الزمالك', 'مصر الجديدة', 'الدقي', 'سموحة', 'التجمع الخامس', 'المهندسين'],
  AE: ['الخليج التجاري', 'مرسى دبي', 'البرشاء', 'الخالدية', 'الممزر', 'الراشدية'],
  KW: ['السالمية', 'الجابرية', 'الروضة', 'الشويخ', 'المنقف'],
};
const FALLBACK_DISTRICTS = ['الحي الأول', 'وسط المدينة', 'الحي الشمالي'];
const PHONE_FORMAT: Record<string, { prefixes: readonly string[]; length: number }> = {
  SA: { prefixes: ['050', '053', '055', '056', '059'], length: 10 },
  EG: { prefixes: ['010', '011', '012', '015'], length: 11 },
  AE: { prefixes: ['050', '052', '055', '056'], length: 10 },
  KW: { prefixes: ['5', '6', '9'], length: 8 },
};
/** Local price level vs. SA, used to author amounts in each currency. */
export const PRICE_FACTOR: Record<string, number> = { SA: 1, EG: 5.6, AE: 1.05, KW: 0.085 };

const VEHICLES = ['تويوتا كامري', 'هيونداي إلنترا', 'كيا K5', 'نيسان صني', 'شيفروليه ماليبو', 'تويوتا هايلكس'];
const COLORS = ['أبيض', 'أسود', 'فضي', 'رمادي', 'أزرق', 'أحمر'];
const PLATE_LETTERS = ['أ ب ج', 'د ر س', 'ص ط ع', 'ق ك ل', 'م ن هـ', 'و ي ب'];

const COUNTS: Record<PersonKind, number> = { customers: 96, drivers: 38, technicians: 52 };
/** Rough market split for the fixtures (share of accounts per country). */
const COUNTRY_WEIGHTS: Record<string, number> = { SA: 0.45, EG: 0.25, AE: 0.18, KW: 0.12 };
const DAY = 86400000;

function pickCountry(r: () => number, countries: readonly Country[]): Country {
  const weighted = countries.map((c) => ({ c, w: COUNTRY_WEIGHTS[c.id] ?? 0 })).filter((x) => x.w > 0);
  const total = weighted.reduce((a, x) => a + x.w, 0);
  let roll = r() * total;
  for (const x of weighted) {
    roll -= x.w;
    if (roll <= 0) return x.c;
  }
  return weighted[weighted.length - 1].c;
}

function makePhone(r: () => number, countryId: string): string {
  const f = PHONE_FORMAT[countryId] ?? { prefixes: ['0'], length: 10 };
  const prefix = pick(r, f.prefixes);
  return prefix + Array.from({ length: f.length - prefix.length }, () => int(r, 0, 9)).join('');
}

function makePerson(kind: PersonKind, index: number, countries: readonly Country[]): Person {
  const cfg = PEOPLE_CONFIG[kind];
  const id = `${cfg.idPrefix}-${1001 + index}`;
  const r = rng(hash(id));
  const country = pickCountry(r, countries);
  const female = kind === 'drivers' ? false : r() < (kind === 'technicians' ? 0.35 : 0.3);
  const [first, latin] = pick(r, female ? FEMALE : MALE);
  const name = `${first} ${pick(r, FATHERS)} ${pick(r, FAMILIES)}`;

  const joinedDaysAgo = int(r, 1, 900);
  // Fresh registrations are usually still waiting for the admin's review.
  const status: PersonStatus = joinedDaysAgo < NEW_ACCOUNT_DAYS ? (r() < 0.8 ? 'inactive' : 'active') : r() < 0.85 ? 'active' : 'inactive';
  const bookings = joinedDaysAgo < NEW_ACCOUNT_DAYS ? 0 : kind === 'customers' ? int(r, 0, 38) : int(r, 12, 240);
  const cancelled = Math.floor(bookings * r() * 0.12);
  const completed = Math.max(0, bookings - cancelled - int(r, 0, 3));
  const birth = new Date(Date.now() - (int(r, 21, 58) * 365 + int(r, 0, 364)) * DAY);

  return {
    id,
    kind,
    countryId: country.id,
    name,
    phone: makePhone(r, country.id),
    email: `${latin}.${int(r, 10, 99)}@email.com`,
    city: pick(r, country.cities),
    district: pick(r, DISTRICTS[country.id] ?? FALLBACK_DISTRICTS),
    gender: female ? 'female' : 'male',
    birthDate: birth.toISOString().slice(0, 10),
    ...(kind !== 'customers' && { nationalId: String(int(r, 1000000000, 2999999999)) }),
    bookings,
    completed,
    cancelled,
    rating: bookings ? +(3.6 + r() * 1.4).toFixed(1) : 0,
    reviewsCount: Math.floor(completed * (0.4 + r() * 0.4)),
    status,
    joinedAt: new Date(Date.now() - joinedDaysAgo * DAY - int(r, 0, 23) * 3600000).toISOString(),
    lastActiveAt: new Date(Date.now() - int(r, 0, 20 * 24 * 60) * 60000).toISOString(),
    ...(kind === 'drivers' && {
      vehicle: `${pick(r, VEHICLES)} ${int(r, 2018, 2025)}`,
      vehicleColor: pick(r, COLORS),
      plate: `${pick(r, PLATE_LETTERS)} ${int(r, 1000, 9999)}`,
    }),
    ...(kind === 'technicians' && {
      specialty: pick(r, SPECIALTIES),
      experienceYears: int(r, 1, 15),
    }),
  };
}

export function generatePeople(kind: PersonKind, countries: readonly Country[]): Person[] {
  if (!countries.some((c) => COUNTRY_WEIGHTS[c.id])) return [];
  return Array.from({ length: COUNTS[kind] }, (_, i) => makePerson(kind, i, countries)).sort(
    (a, b) => +new Date(b.joinedAt) - +new Date(a.joinedAt),
  );
}

// ─────────── per-person history (detail tabs) ───────────

const COMMENTS = [
  'خدمة ممتازة والتزام تام بالموعد، أنصح بالتعامل.',
  'تجربة رائعة وتعامل راقٍ جدًا، شكرًا لكم.',
  'الجلسة كانت مريحة والنظافة على أعلى مستوى.',
  'تأخر بسيط في الوصول لكن الخدمة ممتازة.',
  'احترافية عالية وشرح واضح قبل الجلسة.',
  'جيد بشكل عام وأتمنى تحسين سرعة الرد.',
  'من أفضل التجارب، سأكرر الحجز بالتأكيد.',
];

export function generateHistory(p: Person): PersonHistory {
  const r = rng(hash(p.id + ':history'));
  const now = Date.now();
  const factor = PRICE_FACTOR[p.countryId] ?? 1;
  const partyPool = [...MALE, ...FEMALE].map(([n]) => `${n} ${pick(r, FAMILIES)}`);

  const bookings: PersonBooking[] = Array.from({ length: Math.min(p.bookings, 14) }, (_, i) => {
    const date = now - (i * int(r, 3, 12) + (i ? int(r, 0, 2) : 0)) * DAY - int(r, 1, 8) * 3600000;
    const roll = r();
    const status: BookingStatus = i === 0 && roll < 0.4 ? 'in_progress' : roll < 0.12 ? 'cancelled' : 'completed';
    return {
      id: `BK-${int(r, 20000, 99999)}`,
      service: pick(r, SERVICES),
      party: pick(r, partyPool),
      date: new Date(date).toISOString(),
      amount: Math.round(int(r, 12, 45) * 10 * factor),
      status,
    };
  });

  const reviews: Review[] = Array.from({ length: Math.min(p.reviewsCount, 6) }, (_, i) => ({
    id: `RV-${i}`,
    author: p.kind === 'customers' ? `الفني ${pick(r, partyPool)}` : pick(r, partyPool),
    rating: Math.max(3, Math.min(5, Math.round(p.rating + (r() - 0.4)))),
    comment: pick(r, COMMENTS),
    date: new Date(now - (i * int(r, 5, 20) + 1) * DAY).toISOString(),
    service: pick(r, SERVICES),
  }));

  const templates =
    p.kind === 'technicians'
      ? [
          ['طلب حجز جديد', 'لديك طلب جلسة جديد في منطقتك، افتح التطبيق للقبول.'],
          ['باقتك قاربت على الانتهاء', 'جدّد باقتك لتستمر في استقبال الطلبات دون انقطاع.'],
          ['تقييم جديد', 'حصلت على تقييم جديد من أحد العملاء.'],
          ['تم تفعيل حسابك', 'تمت مراجعة مستنداتك وتفعيل حسابك بنجاح.'],
        ]
      : p.kind === 'drivers'
        ? [
            ['طلب توصيل جديد', 'لديك طلب توصيل فني إلى موقع عميل، افتح التطبيق للتفاصيل.'],
            ['تحديث المستندات', 'يرجى التأكد من صلاحية رخصة القيادة المرفوعة.'],
            ['تم تفعيل حسابك', 'تمت مراجعة مستنداتك وتفعيل حسابك بنجاح.'],
          ]
        : [
            ['تأكيد الحجز', 'تم قبول حجزك وسيصل الفني إليك قريبًا.'],
            ['الفني في الطريق', 'الفني في طريقه إلى موقعك الآن.'],
            ['قيّم تجربتك', 'شاركنا رأيك في جلستك الأخيرة لنطوّر خدماتنا.'],
            ['عرض خاص', 'خصم على جلسات الحجامة الرياضية هذا الأسبوع.'],
          ];
  const notifications: AppNotification[] = templates.map(([title, body], i) => ({
    id: `NT-${i}`,
    title,
    body,
    date: new Date(now - (i * int(r, 1, 5) * DAY + int(r, 1, 20) * 3600000)).toISOString(),
    read: i > 0,
  }));

  const monthly = Array.from({ length: 6 }, () => (p.bookings ? int(r, 1, p.kind === 'customers' ? 6 : 28) : 0));

  return { bookings, reviews, notifications, monthly };
}
