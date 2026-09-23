import {
  ActivityItem,
  AppNotification,
  Booking,
  BookingStatus,
  Person,
  PersonActivity,
  PersonKind,
  PersonStatus,
  Review,
  Transaction,
  TxType,
} from './people.models';
import { PEOPLE_CONFIG, SERVICES, SPECIALTIES } from './people.config';
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
/** Local mobile prefixes; the rest of `phoneLength` is random digits. */
const PHONE_PREFIX: Record<string, readonly string[]> = {
  SA: ['050', '053', '055', '056', '059'],
  EG: ['010', '011', '012', '015'],
  AE: ['050', '052', '055', '056'],
  KW: ['5', '6', '9'],
};
const VEHICLES = ['تويوتا كامري 2023', 'هيونداي إلنترا 2022', 'كيا K5 2023', 'نيسان صني 2021', 'شيفروليه ماليبو 2022', 'تويوتا هايلكس 2024'];
const PLATE_LETTERS = ['أ ب ج', 'د ر س', 'ص ط ع', 'ق ك ل', 'م ن هـ', 'و ي ب'];

const COUNTS: Record<PersonKind, number> = { customers: 96, drivers: 38, technicians: 52 };
/** Rough market split for the fixtures (share of accounts per country). */
const COUNTRY_WEIGHTS: Record<string, number> = { SA: 0.45, EG: 0.25, AE: 0.18, KW: 0.12 };
const DAY = 86400000;

function pickCountry(r: () => number, countries: readonly Country[]): Country {
  const weighted = countries.map((c) => ({ c, w: COUNTRY_WEIGHTS[c.id] ?? 0.1 }));
  const total = weighted.reduce((a, x) => a + x.w, 0);
  let roll = r() * total;
  for (const x of weighted) {
    roll -= x.w;
    if (roll <= 0) return x.c;
  }
  return weighted[weighted.length - 1].c;
}

function makePhone(r: () => number, country: Country): string {
  const prefix = pick(r, PHONE_PREFIX[country.id] ?? ['0']);
  const rest = Math.max(0, country.phoneLength - prefix.length);
  return prefix + Array.from({ length: rest }, () => int(r, 0, 9)).join('');
}

function makePerson(kind: PersonKind, index: number, countries: readonly Country[]): Person {
  const cfg = PEOPLE_CONFIG[kind];
  const id = `${cfg.idPrefix}-${1001 + index}`;
  const r = rng(hash(id));
  const country = pickCountry(r, countries);
  const female = kind === 'drivers' ? false : r() < (kind === 'technicians' ? 0.35 : 0.3);
  const [first, latin] = pick(r, female ? FEMALE : MALE);
  const family = pick(r, FAMILIES);
  const name = `${first} ${pick(r, FATHERS)} ${family}`;

  const statusRoll = r();
  const status: PersonStatus =
    statusRoll < 0.72 ? 'active' : statusRoll < 0.84 ? 'inactive' : statusRoll < 0.93 ? 'pending' : 'blocked';

  const bookings = kind === 'customers' ? int(r, 0, 38) : int(r, 12, 240);
  const cancelled = Math.floor(bookings * r() * 0.12);
  const completed = Math.max(0, bookings - cancelled - int(r, 0, 3));
  const joined = Date.now() - int(r, 20, 900) * DAY;
  const avgTicket = kind === 'customers' ? int(r, 180, 420) : kind === 'drivers' ? int(r, 35, 70) : int(r, 120, 260);

  return {
    id,
    kind,
    countryId: country.id,
    name,
    phone: makePhone(r, country),
    email: `${latin}.${int(r, 10, 99)}@email.com`,
    city: pick(r, country.cities),
    district: pick(r, DISTRICTS[country.id] ?? FALLBACK_DISTRICTS),
    gender: female ? 'female' : 'male',
    bookings,
    completed,
    cancelled,
    // Fixture amounts are authored in the base currency, then localized.
    balance: Math.round((kind === 'customers' ? int(r, 0, 60) * 10 : int(r, 10, 480) * 10) / country.rateToBase),
    total: Math.round((completed * avgTicket) / country.rateToBase),
    rating: +(3.6 + r() * 1.4).toFixed(1),
    reviewsCount: Math.floor(completed * (0.4 + r() * 0.4)),
    status,
    joinedAt: new Date(joined).toISOString(),
    lastActiveAt: new Date(Date.now() - int(r, 0, 20 * 24 * 60) * 60000).toISOString(),
    ...(kind === 'drivers' && {
      vehicle: pick(r, VEHICLES),
      plate: `${pick(r, PLATE_LETTERS)} ${int(r, 1000, 9999)}`,
    }),
    ...(kind === 'technicians' && {
      specialty: pick(r, SPECIALTIES),
      experienceYears: int(r, 1, 15),
    }),
  };
}

export function generatePeople(kind: PersonKind, countries: readonly Country[]): Person[] {
  if (!countries.length) return [];
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
const METHODS = ['مدى', 'فيزا', 'Apple Pay', 'STC Pay', 'المحفظة'];

export function generateActivity(p: Person, currency: string): PersonActivity {
  const r = rng(hash(p.id + ':history'));
  const now = Date.now();
  const partyPool = [...MALE, ...FEMALE].map(([n]) => `${n} ${pick(r, FAMILIES)}`);

  const bookingCount = Math.min(Math.max(p.bookings, 3), 14);
  const bookings: Booking[] = Array.from({ length: bookingCount }, (_, i) => {
    const date = now - (i * int(r, 3, 12) - int(r, 0, 6)) * DAY;
    const roll = r();
    const status: BookingStatus =
      date > now ? 'scheduled' : i === 0 && roll < 0.4 ? 'in_progress' : roll < 0.12 ? 'cancelled' : 'completed';
    return {
      id: `BK-${int(r, 20000, 99999)}`,
      service: pick(r, SERVICES),
      party: pick(r, partyPool),
      date: new Date(date).toISOString(),
      amount: int(r, 12, 45) * 10,
      status,
      city: p.city,
    };
  });

  const txTypes: TxType[] = p.kind === 'customers' ? ['payment', 'payment', 'deposit', 'refund'] : ['payout', 'deposit'];
  const transactions: Transaction[] = Array.from({ length: 10 }, (_, i) => {
    const roll = r();
    return {
      id: `TX-${int(r, 100000, 999999)}`,
      type: pick(r, txTypes),
      amount: int(r, 5, 60) * 10,
      method: pick(r, METHODS),
      date: new Date(now - i * int(r, 2, 9) * DAY - int(r, 0, 23) * 3600000).toISOString(),
      status: roll < 0.84 ? 'success' : roll < 0.94 ? 'pending' : 'failed',
      ref: `#${int(r, 1000000, 9999999)}`,
    };
  });

  const reviews: Review[] = Array.from({ length: Math.min(p.reviewsCount, 6) || 2 }, (_, i) => ({
    id: `RV-${i}`,
    author: p.kind === 'customers' ? `الفني ${pick(r, partyPool)}` : pick(r, partyPool),
    rating: Math.max(3, Math.min(5, Math.round(p.rating + (r() - 0.4)))),
    comment: pick(r, COMMENTS),
    date: new Date(now - (i * int(r, 5, 20) + 1) * DAY).toISOString(),
    service: pick(r, SERVICES),
  }));

  const notifications: AppNotification[] = [
    { title: 'تأكيد الحجز', body: 'تم تأكيد حجزك القادم بنجاح، نتمنى لك تجربة مميزة.', channel: 'push' as const },
    { title: 'تذكير بالموعد', body: 'تذكير: موعد جلستك غدًا الساعة 5:00 مساءً.', channel: 'sms' as const },
    { title: 'عرض خاص', body: 'خصم 20% على جلسات الحجامة الرياضية هذا الأسبوع.', channel: 'push' as const },
    { title: 'إيصال الدفع', body: 'تم استلام دفعتك بنجاح، يمكنك تحميل الفاتورة من التطبيق.', channel: 'email' as const },
    { title: 'قيّم تجربتك', body: 'شاركنا رأيك في جلستك الأخيرة لنطوّر خدماتنا.', channel: 'push' as const },
    { title: 'تحديث الحساب', body: 'تم تحديث بيانات ملفك الشخصي بنجاح.', channel: 'email' as const },
  ].map((n, i) => ({
    ...n,
    id: `NT-${i}`,
    date: new Date(now - (i * int(r, 1, 5) * DAY + int(r, 1, 20) * 3600000)).toISOString(),
    read: i > 1,
  }));

  const activityTemplates: [ActivityItem['kind'], string][] = [
    ['login', 'سجّل الدخول من تطبيق iOS'],
    ['booking', `أنشأ حجزًا جديدًا (${pick(r, SERVICES)})`],
    ['payment', `أتم عملية دفع بقيمة ${int(r, 15, 45) * 10} ${currency}`],
    ['review', 'أضاف تقييمًا جديدًا ★★★★★'],
    ['profile', 'حدّث رقم الجوال في الملف الشخصي'],
    ['booking', 'أعاد جدولة موعد الجلسة'],
    ['login', 'سجّل الدخول من متصفح الويب'],
    ['status', 'تم تفعيل الحساب من قبل الإدارة'],
  ];
  const activity: ActivityItem[] = activityTemplates.map(([kind, text], i) => ({
    id: `AC-${i}`,
    kind,
    text,
    date: new Date(now - (i * int(r, 6, 40) + int(r, 1, 5)) * 3600000).toISOString(),
  }));

  const monthly = Array.from({ length: 6 }, () => int(r, 1, p.kind === 'customers' ? 6 : 28));

  return { bookings, transactions, reviews, notifications, activity, monthly };
}
