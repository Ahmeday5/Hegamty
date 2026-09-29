import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Country } from '../../../countries/countries.models';
import { CountryPricingDraft, DurationPriceDraft, PricingUpdate } from '../../service-catalog.models';

export const DURATION_MAX = 600;
export const PRICE_MAX = 1_000_000;

// ─────────── types ───────────

export type DurationPriceForm = FormGroup<{
  /** `false` = open-ended session (no fixed length). */
  hasDuration: FormControl<boolean>;
  durationMin: FormControl<number | null>;
  priceMin: FormControl<number | null>;
  priceMax: FormControl<number | null>;
}>;

/** One country block: where it's offered and at which durations. */
export type CountryPricingForm = FormGroup<{
  countryId: FormControl<string>;
  governorateIds: FormControl<string[]>;
  prices: FormArray<DurationPriceForm>;
}>;

/** Editing one existing pricing row. */
export type PricingEditForm = FormGroup<{
  governorateIds: FormControl<string[]>;
  price: DurationPriceForm;
}>;

// ─────────── validators ───────────

/** Duration rules apply only to timed sessions; the range rule always applies. */
const durationPriceValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const { hasDuration, durationMin, priceMin, priceMax } = (group as DurationPriceForm).getRawValue();
  const errors: ValidationErrors = {};
  if (hasDuration) {
    if (durationMin === null || (durationMin as unknown) === '') errors['durationRequired'] = true;
    else if (!Number.isInteger(durationMin)) errors['durationInteger'] = true;
    else if (durationMin < 1 || durationMin > DURATION_MAX) errors['durationRange'] = true;
  }
  if (typeof priceMin === 'number' && typeof priceMax === 'number' && priceMax < priceMin) errors['priceRange'] = true;
  return Object.keys(errors).length ? errors : null;
};

/** Within one country, each duration (and "open-ended") may appear once. Marks the later duplicates. */
const uniqueDurationsValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  (control as FormArray<DurationPriceForm>).controls.forEach((row, i) => {
    const { hasDuration, durationMin } = row.getRawValue();
    if (hasDuration && !durationMin) return;
    const key = hasDuration ? String(durationMin) : 'open';
    if (seen.has(key)) duplicates.push(i);
    else seen.add(key);
  });
  return duplicates.length ? { duplicateDurations: duplicates } : null;
};

/**
 * An open-ended session means one price range for the whole service in that
 * country — so it can't sit next to timed durations.
 */
const openExclusiveValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const rows = (control as FormArray<DurationPriceForm>).controls;
  return rows.length > 1 && rows.some((r) => !r.controls.hasDuration.value) ? { openNotAlone: true } : null;
};

/** A country appears once per form — more durations go inside its block. */
export const uniqueCountriesValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  (control as FormArray<CountryPricingForm>).controls.forEach((block, i) => {
    const id = block.controls.countryId.value;
    if (!id) return;
    if (seen.has(id)) duplicates.push(i);
    else seen.add(id);
  });
  return duplicates.length ? { duplicateCountries: duplicates } : null;
};

// ─────────── factories ───────────

const priceControl = (value: number | null | undefined) =>
  new FormControl<number | null>(value ?? null, [Validators.required, Validators.min(0), Validators.max(PRICE_MAX)]);

export function createDurationPriceForm(fb: NonNullableFormBuilder, init: Partial<DurationPriceDraft> = {}): DurationPriceForm {
  const hasDuration = init.durationMin !== null;
  return fb.group(
    {
      hasDuration: fb.control(hasDuration),
      durationMin: new FormControl<number | null>(init.durationMin ?? null),
      priceMin: priceControl(init.priceMin),
      priceMax: priceControl(init.priceMax),
    },
    { validators: durationPriceValidator },
  );
}

export function createCountryPricingForm(
  fb: NonNullableFormBuilder,
  init: { countryId?: string; governorateIds?: string[]; prices?: Partial<DurationPriceDraft>[] } = {},
): CountryPricingForm {
  const prices = init.prices?.length ? init.prices : [{}];
  return fb.group({
    countryId: fb.control(init.countryId ?? '', Validators.required),
    governorateIds: fb.control<string[]>(init.governorateIds ?? [], Validators.required),
    prices: new FormArray(
      prices.map((p) => createDurationPriceForm(fb, p)),
      [Validators.required, uniqueDurationsValidator, openExclusiveValidator],
    ),
  });
}

/** A block for `country` with every governorate pre-selected (the common case). */
export function createCountryPricingFormFor(
  fb: NonNullableFormBuilder,
  country: Country | undefined,
  prices?: Partial<DurationPriceDraft>[],
): CountryPricingForm {
  return createCountryPricingForm(fb, {
    countryId: country?.id ?? '',
    governorateIds: country?.governorates.map((g) => g.id) ?? [],
    prices,
  });
}

export function createPricingEditForm(fb: NonNullableFormBuilder, init: PricingUpdate): PricingEditForm {
  return fb.group({
    governorateIds: fb.control<string[]>(init.governorateIds, Validators.required),
    price: createDurationPriceForm(fb, init),
  });
}

// ─────────── readers ───────────

export function readDurationPrice(form: DurationPriceForm): DurationPriceDraft {
  const v = form.getRawValue();
  return {
    durationMin: v.hasDuration ? Number(v.durationMin) : null,
    priceMin: Number(v.priceMin),
    priceMax: Number(v.priceMax),
  };
}

export function readCountryPricing(form: CountryPricingForm): CountryPricingDraft {
  const v = form.controls;
  return {
    countryId: v.countryId.value,
    governorateIds: v.governorateIds.value,
    prices: v.prices.controls.map(readDurationPrice),
  };
}

export function readPricingEdit(form: PricingEditForm): PricingUpdate {
  return { ...readDurationPrice(form.controls.price), governorateIds: form.controls.governorateIds.value };
}

/** Marks everything touched and re-runs validators so every error shows at once. */
export function revealErrors(control: AbstractControl): void {
  control.markAllAsTouched();
  control.updateValueAndValidity();
}
