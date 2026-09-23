import { BookingStatus } from '../people/people.models';

export type { BookingStatus };
export type BookingLocation = 'clinic' | 'home';
export type PaymentStatus = 'paid' | 'pending' | 'refunded';

export interface BookingEvent {
  id: string;
  kind: 'created' | 'confirmed' | 'assigned' | 'started' | 'completed' | 'cancelled' | 'payment' | 'updated';
  text: string;
  date: string;
}

export interface BookingRecord {
  id: string;
  /** Market of the booking — all parties and the service belong to it. */
  countryId: string;
  /** VAT rate applied at booking time (country rates can change later). */
  vatRate: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  technicianId: string;
  technicianName: string;
  /** Home visits only. */
  driverId?: string;
  driverName?: string;
  serviceId: string;
  serviceName: string;
  /** Appointment start (ISO). */
  date: string;
  durationMin: number;
  location: BookingLocation;
  /** Clinic branch or home address. */
  address: string;
  city: string;
  price: number;
  homeFee: number;
  discount: number;
  vat: number;
  total: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  status: BookingStatus;
  notes: string;
  rating?: number;
  createdAt: string;
  events: BookingEvent[];
}

export interface BookingDraft {
  countryId: string;
  customerId: string;
  technicianId: string;
  driverId?: string;
  serviceId: string;
  date: string;
  location: BookingLocation;
  address: string;
  paymentMethod: string;
  discount: number;
  notes: string;
  status: BookingStatus;
}

/** Payment methods offered per market (fallback for markets added later). */
const PAYMENT_METHODS_BY_COUNTRY: Record<string, readonly string[]> = {
  SA: ['مدى', 'فيزا', 'Apple Pay', 'STC Pay', 'نقدًا', 'المحفظة'],
  EG: ['فيزا', 'ميزة', 'فودافون كاش', 'فوري', 'نقدًا', 'المحفظة'],
  AE: ['فيزا', 'ماستركارد', 'Apple Pay', 'نقدًا', 'المحفظة'],
  KW: ['كي نت', 'فيزا', 'Apple Pay', 'نقدًا', 'المحفظة'],
};
const DEFAULT_PAYMENT_METHODS = ['فيزا', 'ماستركارد', 'نقدًا', 'المحفظة'] as const;

export function paymentMethodsFor(countryId: string): readonly string[] {
  return PAYMENT_METHODS_BY_COUNTRY[countryId] ?? DEFAULT_PAYMENT_METHODS;
}

export const PAYMENT_META: Record<PaymentStatus, { label: string; chip: string }> = {
  paid: { label: 'مدفوع', chip: 'chip--green' },
  pending: { label: 'بانتظار الدفع', chip: 'chip--amber' },
  refunded: { label: 'مسترد', chip: 'chip--purple' },
};

export const LOCATION_META: Record<BookingLocation, { label: string; chip: string; icon: 'home' | 'map-pin' }> = {
  clinic: { label: 'في العيادة', chip: 'chip--teal', icon: 'map-pin' },
  home: { label: 'زيارة منزلية', chip: 'chip--pink', icon: 'home' },
};
