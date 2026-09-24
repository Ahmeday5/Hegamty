/**
 * Domain models shared by the customers / drivers / technicians pages.
 * Accounts self-register from the mobile app and start `inactive`; the admin
 * reviews their documents and activates them.
 */

export type PersonKind = 'customers' | 'drivers' | 'technicians';
export type PersonStatus = 'active' | 'inactive';

export interface Person {
  id: string;
  kind: PersonKind;
  /** Country the account operates in (see CountriesStore). */
  countryId: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  gender: 'male' | 'female';
  birthDate: string;
  /** Technicians & drivers only. */
  nationalId?: string;
  /** Customers: bookings made · Technicians: sessions · Drivers: trips. */
  bookings: number;
  completed: number;
  cancelled: number;
  rating: number;
  reviewsCount: number;
  status: PersonStatus;
  joinedAt: string;
  lastActiveAt: string;
  /** Drivers only. */
  vehicle?: string;
  vehicleColor?: string;
  plate?: string;
  /** Technicians only. */
  specialty?: string;
  experienceYears?: number;
}

export type BookingStatus = 'completed' | 'scheduled' | 'in_progress' | 'cancelled';

export interface PersonBooking {
  id: string;
  service: string;
  /** The counter-party (technician for a customer, customer otherwise). */
  party: string;
  date: string;
  amount: number;
  status: BookingStatus;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
  service: string;
}

/** In-app notification (the only channel the platform uses). */
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
}

export interface PersonHistory {
  bookings: PersonBooking[];
  reviews: Review[];
  notifications: AppNotification[];
  /** Last 6 months of bookings, oldest first. */
  monthly: number[];
}

/** Uploaded identity / vehicle documents, per account kind. */
export interface PersonDocument {
  key: 'photo' | 'id_front' | 'id_back' | 'license';
  label: string;
}

/** Editable subset used by the edit form. */
export type PersonDraft = Pick<
  Person,
  | 'countryId' | 'name' | 'phone' | 'email' | 'city' | 'district' | 'gender' | 'birthDate' | 'status'
  | 'nationalId' | 'vehicle' | 'vehicleColor' | 'plate' | 'specialty' | 'experienceYears'
>;
