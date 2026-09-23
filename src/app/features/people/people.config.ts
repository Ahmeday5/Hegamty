import { IconName } from '../../shared/components/icon/icon.component';
import { Tone } from '../../shared/components/kpi-card/kpi-card.component';
import { BookingStatus, Person, PersonKind, PersonStatus, TxType } from './people.models';

export type DetailTab = 'overview' | 'bookings' | 'transactions' | 'reviews' | 'notifications' | 'activity';

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
  balanceLabel: string;
  totalLabel: string;
  /** Header of the counter-party column in the bookings tab. */
  partyLabel: string;
  /** Role-specific extra column in the list (vehicle / specialty). */
  extra?: { label: string; value: (p: Person) => string };
  tabs: { id: DetailTab; label: string; icon: IconName }[];
}

const BASE_TABS = (bookingsLabel: string, txLabel: string): PeopleConfig['tabs'] => [
  { id: 'overview', label: 'نظرة عامة', icon: 'grid' },
  { id: 'bookings', label: bookingsLabel, icon: 'calendar' },
  { id: 'transactions', label: txLabel, icon: 'wallet' },
  { id: 'reviews', label: 'التقييمات', icon: 'star' },
  { id: 'notifications', label: 'الإشعارات', icon: 'bell' },
  { id: 'activity', label: 'النشاط', icon: 'activity' },
];

export const PEOPLE_CONFIG: Record<PersonKind, PeopleConfig> = {
  customers: {
    kind: 'customers',
    title: 'العملاء',
    singular: 'عميل',
    subtitle: 'إدارة حسابات العملاء وحجوزاتهم وأرصدتهم',
    icon: 'users',
    idPrefix: 'CU',
    countLabel: 'الحجوزات',
    balanceLabel: 'الرصيد',
    totalLabel: 'إجمالي الإنفاق',
    partyLabel: 'الفني',
    tabs: BASE_TABS('الحجوزات', 'المعاملات المالية'),
  },
  drivers: {
    kind: 'drivers',
    title: 'السائقون',
    singular: 'سائق',
    subtitle: 'متابعة السائقين ومركباتهم ورحلات الزيارات المنزلية',
    icon: 'car',
    idPrefix: 'DR',
    countLabel: 'الرحلات',
    balanceLabel: 'المستحقات',
    totalLabel: 'إجمالي الأرباح',
    partyLabel: 'العميل',
    extra: { label: 'المركبة', value: (p) => p.vehicle ?? '—' },
    tabs: BASE_TABS('الرحلات', 'الأرباح والمدفوعات'),
  },
  technicians: {
    kind: 'technicians',
    title: 'الفنيون',
    singular: 'فني',
    subtitle: 'إدارة فريق الفنيين وتخصصاتهم وجلساتهم وتقييماتهم',
    icon: 'stethoscope',
    idPrefix: 'TE',
    countLabel: 'الجلسات',
    balanceLabel: 'المستحقات',
    totalLabel: 'إجمالي الأرباح',
    partyLabel: 'العميل',
    extra: { label: 'التخصص', value: (p) => p.specialty ?? '—' },
    tabs: BASE_TABS('الجلسات', 'الأرباح والمدفوعات'),
  },
};

// ─────────── Label / tone lookups shared by every screen ───────────

export const STATUS_META: Record<PersonStatus, { label: string; chip: string }> = {
  active: { label: 'نشط', chip: 'chip--green' },
  inactive: { label: 'غير نشط', chip: 'chip--slate' },
  pending: { label: 'قيد المراجعة', chip: 'chip--amber' },
  blocked: { label: 'محظور', chip: 'chip--red' },
};

export const BOOKING_META: Record<BookingStatus, { label: string; chip: string; color: string }> = {
  completed: { label: 'مكتملة', chip: 'chip--green', color: '#20843d' },
  scheduled: { label: 'مجدولة', chip: 'chip--blue', color: '#2563eb' },
  in_progress: { label: 'قيد التنفيذ', chip: 'chip--amber', color: '#f59e0b' },
  cancelled: { label: 'ملغاة', chip: 'chip--red', color: '#ef4444' },
};

export const TX_META: Record<TxType, { label: string; tone: Tone; icon: IconName; sign: 1 | -1 }> = {
  deposit: { label: 'شحن رصيد', tone: 'green', icon: 'download', sign: 1 },
  payment: { label: 'دفع حجز', tone: 'blue', icon: 'card', sign: -1 },
  refund: { label: 'استرداد', tone: 'amber', icon: 'refresh', sign: 1 },
  payout: { label: 'تحويل مستحقات', tone: 'purple', icon: 'send', sign: -1 },
};

export const SPECIALTIES = [
  'حجامة رطبة', 'حجامة جافة', 'حجامة رياضية', 'حجامة تجميلية', 'الحجامة بالإبر', 'المساج العلاجي',
] as const;

export const SERVICES = [
  'حجامة رطبة', 'حجامة جافة', 'حجامة رياضية', 'حجامة تجميلية', 'حجامة منزلية', 'جلسة استشارة',
] as const;

export function isPersonKind(value: unknown): value is PersonKind {
  return value === 'customers' || value === 'drivers' || value === 'technicians';
}
