export type BadgeType = 'red' | 'amber' | 'green' | 'blue';

export const BADGE_CLASS_MAP: Record<BadgeType, string> = {
  red: 'sbb',
  amber: 'sbb sbb-am',
  green: 'sbb sbb-gr',
  blue: 'sbb sbb-bl',
};
