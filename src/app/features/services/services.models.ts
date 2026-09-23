import { IconName } from '../../shared/components/icon/icon.component';
import { Tone } from '../../shared/components/kpi-card/kpi-card.component';

export type ServiceCategory = 'cupping' | 'therapy' | 'consultation';

export interface ClinicService {
  id: string;
  /** The market this service is sold in — the app lists it only there. */
  countryId: string;
  name: string;
  description: string;
  category: ServiceCategory;
  /** Price at the clinic, in the country's currency. */
  price: number;
  durationMin: number;
  /** Offered as a home visit (extra fee on top of `price`). */
  homeVisit: boolean;
  homeFee: number;
  active: boolean;
  bookingsCount: number;
  rating: number;
  tone: Tone;
  icon: IconName;
  createdAt: string;
}

export type ServiceDraft = Pick<
  ClinicService,
  'countryId' | 'name' | 'description' | 'category' | 'price' | 'durationMin' | 'homeVisit' | 'homeFee' | 'active' | 'tone' | 'icon'
>;

export const CATEGORY_META: Record<ServiceCategory, { label: string; chip: string }> = {
  cupping: { label: 'حجامة', chip: 'chip--green' },
  therapy: { label: 'علاج طبيعي', chip: 'chip--purple' },
  consultation: { label: 'استشارات', chip: 'chip--blue' },
};

export const SERVICE_TONES: Tone[] = ['green', 'blue', 'purple', 'teal', 'amber', 'pink'];
export const SERVICE_ICONS: IconName[] = ['droplet', 'sparkles', 'activity', 'stethoscope', 'award', 'message'];
