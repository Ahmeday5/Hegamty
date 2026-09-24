import { BookingStatus } from '../people/people.models';

export type { BookingStatus };

/**
 * Bookings are created by customers in the app for the same day and always
 * happen at the customer's home. The technician accepts, starts and
 * completes the session from their app; the dashboard only monitors them
 * (and can cancel/delete). The price is informational — it's paid to the
 * technician directly, outside the platform.
 */
export interface BookingEvent {
  kind: 'created' | 'accepted' | 'started' | 'completed' | 'cancelled';
  date: string;
}

export interface BookingRecord {
  id: string;
  countryId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  technicianId: string;
  technicianName: string;
  /** Optional — requested by the technician from the app. */
  driverId?: string;
  driverName?: string;
  serviceId: string;
  serviceName: string;
  /** When the customer placed the booking (sessions happen the same day). */
  date: string;
  durationMin: number | null;
  address: string;
  city: string;
  price: number;
  status: BookingStatus;
  notes: string;
  rating?: number;
  events: BookingEvent[];
}
