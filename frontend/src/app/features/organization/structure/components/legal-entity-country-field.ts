import { Signal, computed, effect, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import { CatalogsStore } from '../../../../core/catalogs/catalogs.store';
import { DomainError, userMessage } from '../../../../core/errors/domain-error';
import { Country, Region, defaultCountryId } from '../../../../core/models/catalogs';

/** Codes the API uses for a NIT that is invalid or already registered. */
const TAX_ID_ERROR_CODES: ReadonlySet<string> = new Set(['DUPLICATE_TAX_ID', 'INVALID_TAX_ID']);
/** 409 when the country of a legal entity that already has sedes is changed: shown in the dialog. */
const HAS_CONGREGATIONS_CODE = 'LEGAL_ENTITY_HAS_CONGREGATIONS';

/** Field of the legal entity form an API error belongs to; `form` shows it in the dialog alert. */
export type LegalEntityErrorTarget = 'taxId' | 'country' | 'municipality' | 'form';

export function legalEntityErrorTarget(error: unknown): LegalEntityErrorTarget {
  if (!(error instanceof DomainError)) {
    return 'form';
  }
  if (TAX_ID_ERROR_CODES.has(error.code)) {
    return 'taxId';
  }
  switch (error.code) {
    case 'COUNTRY_NOT_FOUND':
    case 'COUNTRY_INACTIVE':
      return 'country';
    case 'MUNICIPALITY_COUNTRY_MISMATCH':
      return 'municipality';
    case HAS_CONGREGATIONS_CODE:
      return 'form';
    default:
      // Any other conflict of a legal entity is a NIT already registered.
      return error.status === 409 ? 'taxId' : 'form';
  }
}

/**
 * "País" and "Departamento / estado" of a legal entity form, built in the injection context of the dialog.
 * It loads the countries, preselects the default one while the control is empty (0), loads the regions
 * (departamentos/estados) of the selected country, and makes the municipality required only when the
 * chosen country has municipalities loaded.
 */
export class LegalEntityCountryField {
  private readonly store = inject(CatalogsStore);

  readonly countries = rxResource({ stream: () => this.store.loadCountries() });
  /** Country of the legal entity being edited, kept in the list even if it is no longer active. */
  private readonly current = signal<Country | null>(null);
  /** Region of the legal entity being edited, kept in the list even before regions finish loading. */
  private readonly currentRegion = signal<Region | null>(null);
  /** Active countries sorted by name, plus the current one of an edited legal entity (marked inactive). */
  readonly options = computed<readonly Country[]>(() => {
    const active = this.countries.hasValue()
      ? this.countries.value().filter((country) => country.isActive !== false)
      : [];
    const current = this.current();
    const all =
      current && this.countries.hasValue() && !active.some((country) => country.id === current.id)
        ? [...active, current]
        : active;
    return [...all].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  });
  readonly loadError = computed(() => (this.countries.error() ? userMessage(this.countries.error()) : null));
  /** Id of the chosen country; 0 while none is chosen. */
  readonly selectedId: Signal<number>;
  readonly selected = computed(() => this.options().find((country) => country.id === this.selectedId()) ?? null);
  /** `null` while the country is not chosen or the countries are not loaded. */
  readonly hasMunicipalities = computed(() => this.selected()?.hasMunicipalities ?? null);
  /** Note shown instead of the municipality search while no country is chosen. */
  readonly municipalityBlockedText = computed(() => (this.selectedId() > 0 ? null : 'Elige primero el país.'));

  /** Regions (departamentos/estados) of the chosen country. */
  readonly regions = rxResource({
    params: () => {
      const countryId = this.selectedId();
      return countryId > 0 && this.hasMunicipalities() !== false ? { countryId } : undefined;
    },
    stream: ({ params }) => this.store.loadRegions(params.countryId),
  });
  readonly regionOptions = computed<readonly Region[]>(() => {
    const loaded = this.regions.hasValue() ? this.regions.value() : [];
    const current = this.currentRegion();
    const all =
      current &&
      current.countryId === this.selectedId() &&
      !loaded.some((region) => region.code === current.code)
        ? [...loaded, current]
        : loaded;
    return [...all].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  });
  readonly regionsLoadError = computed(() =>
    this.regions.error() ? userMessage(this.regions.error()) : null,
  );

  /** Text of an option: an inactive country (only the current one of an edited entity) says so. */
  label(country: Country): string {
    return country.isActive === false ? `${country.name} (inactivo)` : country.name;
  }

  /**
   * Keeps the country and region of the legal entity being edited in the options although the API no
   * longer lists the country (inactive); saving it is then refused with COUNTRY_INACTIVE. `null` when creating.
   */
  keepCurrent(
    current: {
      readonly countryId: number;
      readonly countryName: string;
      readonly municipalityCode?: string | null;
      readonly regionCode?: string | null;
      readonly regionName?: string | null;
    } | null,
  ): void {
    this.current.set(
      current && current.countryId > 0
        ? { id: current.countryId, isoAlpha2: '', name: current.countryName, hasMunicipalities: true, isActive: false }
        : null,
    );
    if (!current || current.countryId <= 0) {
      this.currentRegion.set(null);
      return;
    }
    if (current.regionCode && current.regionName) {
      this.currentRegion.set({
        countryId: current.countryId,
        code: current.regionCode,
        name: current.regionName,
      });
      this.region?.setValue(current.regionCode);
      return;
    }
    // If the row has a municipalityCode without regionCode, resolve its region from the catalog.
    if (current.municipalityCode) {
      const cached = this.store.municipality(current.municipalityCode);
      if (cached?.regionCode) {
        this.currentRegion.set({
          countryId: current.countryId,
          code: cached.regionCode,
          name: cached.regionName,
        });
        this.region?.setValue(cached.regionCode);
        return;
      }
      this.store.resolveMunicipality(current.municipalityCode).subscribe({
        next: (municipality) => {
          if (this.municipality.value === current.municipalityCode && municipality.regionCode) {
            this.currentRegion.set({
              countryId: current.countryId,
              code: municipality.regionCode,
              name: municipality.regionName,
            });
            this.region?.setValue(municipality.regionCode);
          }
        },
        error: () => undefined,
      });
      return;
    }
    if (current.regionName) {
      this.currentRegion.set(null);
    }
  }

  constructor(
    private readonly country: FormControl<number>,
    private readonly municipality: FormControl<string>,
    private readonly region?: FormControl<string>,
  ) {
    this.selectedId = toSignal(country.valueChanges.pipe(startWith(country.value)), { initialValue: country.value });

    effect(() => {
      const options = this.options();
      if (this.selectedId() === 0 && options.length > 0) {
        const preselected = defaultCountryId(options);
        if (preselected !== null) {
          this.country.setValue(preselected);
        }
      }
    });

    effect(() => {
      const required = this.hasMunicipalities() !== false;
      this.municipality.setValidators(required ? Validators.required : null);
      if (!required) {
        this.municipality.setValue('');
        this.region?.setValue('');
      }
      if (this.region) {
        if (!required || this.selectedId() <= 0) {
          this.region.disable({ emitEvent: false });
        } else {
          this.region.enable({ emitEvent: false });
        }
      }
      this.municipality.updateValueAndValidity();
    });
  }
}
