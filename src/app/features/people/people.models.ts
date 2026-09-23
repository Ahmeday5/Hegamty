/**
 * Domain models shared by the customers / drivers / technicians pages. The
 * three entities differ only in labels and a couple of role-specific
 * fields, so one model + a per-kind config (see `people.config.ts`) drives
 * all six screens.
 */

export type PersonKind = 'customers' | 'drivers' | 'technicians';
export type PersonStatus = 'active' | 'inactive' | 'pending' | 'blocked';

export interface Person {
  id: string;
  kind: PersonKind;
  /** ISO code of the country this account operates in (see CountriesStore). */
  countryId: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  gender: 'male' | 'female';
  /** Customers: bookings · Drivers: trips · Technicians: sessions. */
  bookings: number;
  completed: number;
  cancelled: number;
  /** Wallet balance (customers) or pending payout (drivers/technicians). */
  balance: number;
  /** Customers: total spend · Drivers/technicians: total earnings. */
  total: number;
  rating: number;
  reviewsCount: number;
  status: PersonStatus;
  joinedAt: string;
  lastActiveAt: string;
  /** Drivers only. */
  vehicle?: string;
  plate?: string;
  /** Technicians only. */
  specialty?: string;
  experienceYears?: number;
}

export type BookingStatus = 'completed' | 'scheduled' | 'in_progress' | 'cancelled';

export interface Booking {
  id: string;
  service: string;
  /** The counter-party shown in the row (technician for a customer, etc.). */
  party: string;
  date: string;
  amount: number;
  status: BookingStatus;
  city: string;
}

export type TxType = 'deposit' | 'payment' | 'refund' | 'payout';

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  method: string;
  date: string;
  status: 'success' | 'pending' | 'failed';
  ref: string;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
  service: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  channel: 'push' | 'sms' | 'email';
  date: string;
  read: boolean;
}

export interface ActivityItem {
  id: string;
  kind: 'login' | 'booking' | 'payment' | 'review' | 'profile' | 'status';
  text: string;
  date: string;
}

export interface PersonActivity {
  bookings: Booking[];
  transactions: Transaction[];
  reviews: Review[];
  notifications: AppNotification[];
  activity: ActivityItem[];
  /** Last 6 months of bookings, oldest first. */
  monthly: number[];
}

/** Editable subset used by the add/edit form. */
export type PersonDraft = Pick<
  Person,
  | 'countryId' | 'name' | 'phone' | 'email' | 'city' | 'district' | 'gender' | 'status'
  | 'vehicle' | 'plate' | 'specialty' | 'experienceYears'
>;
