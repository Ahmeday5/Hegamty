import { IconName } from '../../shared/components/icon/icon.component';
import { BookingStatus, Person, PersonDocument, PersonKind, PersonStatus } from './people.models';

export type DetailTab = 'overview' | 'bookings' | 'reviews' | 'notifications';

export interface PeopleConfig {
  kind: PersonKind;
  /** Plural page title, e.g. "العملاء". */
  title: string;
  /** Singular noun, e.g. "عميل". */
  singular: string;
  subtitle: string;
  icon: IconName;
  idPrefix: string;
  /** Column / stat label for `Person.bookings`. */
  countLabel: string;
  /** Header of the counter-party column in the bookings tab. */
  partyLabel: string;
  /** Role-specific extra column in the list (vehicle / specialty). */
  extra?: { label: string; value: (p: Person) => string };
  documents: PersonDocument[];
  tabs: { id: DetailTab; label: string; icon: IconName }[];
}

const PHOTO: PersonDocument = { key: 'photo', label: 'الصورة الشخصية' };
const ID_DOCS: PersonDocument[] = [
  { key: 'id_front', label: 'البطاقة (وجه)' },
  { key: 'id_back', label: 'البطاقة (ظهر)' },
];

const tabs = (bookingsLabel: string): PeopleConfig['tabs'] => [
  { id: 'overview', label: 'نظرة عامة', icon: 'grid' },
  { id: 'bookings', label: bookingsLabel, icon: 'calendar' },
  { id: 'reviews', label: 'التقييمات', icon: 'star' },
  { id: 'notifications', label: 'الإشعارات', icon: 'bell' },
];

export const PEOPLE_CONFIG: Record<PersonKind, PeopleConfig> = {
  customers: {
    kind: 'customers',
    title: 'العملاء',
    singular: 'عميل',
    subtitle: 'حسابات العملاء المسجلين من التطبيق وحجوزاتهم',
    icon: 'users',
    idPrefix: 'CU',
    countLabel: 'الحجوزات',
    partyLabel: 'الفني',
    documents: [PHOTO],
    tabs: tabs('الحجوزات'),
  },
  drivers: {
    kind: 'drivers',
    title: 'السائقون',
    singular: 'سائق',
    subtitle: 'مراجعة مستندات السائقين ومركباتهم وتفعيل حساباتهم',
    icon: 'car',
    idPrefix: 'DR',
    countLabel: 'الرحلات',
    partyLabel: 'الفني',
    extra: { label: 'المركبة', value: (p) => p.vehicle ?? '—' },
    documents: [PHOTO, ...ID_DOCS, { key: 'license', label: 'رخصة القيادة' }],
    tabs: tabs('الرحلات'),
  },
  technicians: {
    kind: 'technicians',
    title: 'الفنيون',
    singular: 'فني',
    subtitle: 'مراجعة مستندات الفنيين وتفعيل حساباتهم ومتابعة باقاتهم',
    icon: 'stethoscope',
    idPrefix: 'TE',
    countLabel: 'الجلسات',
    partyLabel: 'العميل',
    extra: { label: 'التخصص', value: (p) => p.specialty ?? '—' },
    documents: [PHOTO, ...ID_DOCS],
    tabs: tabs('الجلسات'),
  },
};

// ─────────── Label / tone lookups shared by every screen ───────────

export const STATUS_META: Record<PersonStatus, { label: string; chip: string }> = {
  active: { label: 'نشط', chip: 'chip--green' },
  inactive: { label: 'غير نشط', chip: 'chip--slate' },
};

export const BOOKING_META: Record<BookingStatus, { label: string; chip: string; color: string }> = {
  scheduled: { label: 'مؤكد', chip: 'chip--blue', color: '#2563eb' },
  in_progress: { label: 'قيد التنفيذ', chip: 'chip--amber', color: '#f59e0b' },
  completed: { label: 'مكتمل', chip: 'chip--green', color: '#0f7c84' },
  cancelled: { label: 'ملغي', chip: 'chip--red', color: '#ef4444' },
};

export const SPECIALTIES = [
  'حجامة رطبة', 'حجامة جافة', 'حجامة رياضية', 'حجامة تجميلية', 'الحجامة بالإبر', 'المساج العلاجي',
] as const;

export const SERVICES = [
  'حجامة رطبة', 'حجامة جافة', 'حجامة رياضية', 'حجامة تجميلية', 'مساج علاجي', 'جلسة استشارة',
] as const;

/** Accounts registered in the last N days get a "جديد" badge (awaiting review). */
export const NEW_ACCOUNT_DAYS = 10;

export function isNewAccount(p: Person): boolean {
  return Date.now() - +new Date(p.joinedAt) < NEW_ACCOUNT_DAYS * 86400000;
}

export function ageOf(birthDate: string): number {
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}
