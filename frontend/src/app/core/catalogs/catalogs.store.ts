import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { Country, Municipality, Region, defaultCountryId } from '../models/catalogs';
import { Catalogs, CatalogsRepository } from './catalogs.repository';

const UNKNOWN_LABEL = '—';

/**
 * Catalogs loaded once per session from the API, plus the municipalities seen so far (to print a
 * code as "Medellín (Antioquia)" without asking the API again). Screens call `load()` before they
 * show a select and read the signals afterwards.
 */
@Injectable({ providedIn: 'root' })
export class CatalogsStore {
  private readonly repository = inject(CatalogsRepository);
  private readonly loaded = signal<Catalogs | null>(null);
  private readonly municipalities = signal<ReadonlyMap<string, Municipality>>(new Map());
  private readonly defaultRegionsSignal = signal<readonly Region[]>([]);
  private inFlight: Observable<Catalogs> | null = null;
  private countriesRequest: Observable<readonly Country[]> | null = null;
  private readonly regionsByCountry = new Map<number, Observable<readonly Region[]>>();

  readonly isLoaded = computed(() => this.loaded() !== null);
  readonly documentTypes = computed(() => this.loaded()?.documentTypes ?? []);
  readonly maritalStatuses = computed(() => this.loaded()?.maritalStatuses ?? []);
  readonly educationLevels = computed(() => this.loaded()?.educationLevels ?? []);
  readonly studyTypes = computed(() => this.loaded()?.studyTypes ?? []);
  readonly meetingTypes = computed(() => this.loaded()?.meetingTypes ?? []);
  readonly attendanceCategories = computed(() => this.loaded()?.attendanceCategories ?? []);
  readonly defaultRegions = this.defaultRegionsSignal.asReadonly();

  /** Loads the catalogs the first time and reuses them afterwards; concurrent calls share one request. */
  load(): Observable<Catalogs> {
    const current = this.loaded();
    if (current) {
      return of(current);
    }
    this.inFlight ??= this.repository.catalogs().pipe(
      tap((catalogs) => this.loaded.set(catalogs)),
      finalize(() => (this.inFlight = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.inFlight;
  }

  /** Countries of the geography, asked once per session; a failed request is retried on the next call. */
  loadCountries(): Observable<readonly Country[]> {
    if (typeof this.repository.countries !== 'function') {
      return of([]);
    }
    this.countriesRequest ??= this.repository.countries().pipe(
      catchError((error: unknown) => {
        this.countriesRequest = null;
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.countriesRequest;
  }

  /** Regions (departamentos/estados) of a country, asked once per country in the session. */
  loadRegions(countryId: number): Observable<readonly Region[]> {
    if (countryId <= 0 || typeof this.repository.regions !== 'function') {
      return of([]);
    }
    let request = this.regionsByCountry.get(countryId);
    if (!request) {
      request = this.repository.regions(countryId).pipe(
        catchError((error: unknown) => {
          this.regionsByCountry.delete(countryId);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.regionsByCountry.set(countryId, request);
    }
    return request;
  }

  /** Loads the regions (departamentos) of the default country (Colombia, or first active country). */
  loadDefaultRegions(): Observable<readonly Region[]> {
    const existing = this.defaultRegionsSignal();
    if (existing.length > 0) {
      return of(existing);
    }
    return this.loadCountries().pipe(
      switchMap((countries) => {
        const countryId = defaultCountryId(countries) ?? countries[0]?.id ?? 0;
        return countryId > 0 ? this.loadRegions(countryId) : of([]);
      }),
      tap((regions) => this.defaultRegionsSignal.set(regions)),
    );
  }

  /** Asks the API again on the next `loadCountries()` (a country was activated or deactivated). */
  forgetCountries(): void {
    this.countriesRequest = null;
    this.regionsByCountry.clear();
    this.defaultRegionsSignal.set([]);
  }

  /** Forgets everything (a new session may see different data). */
  reset(): void {
    this.loaded.set(null);
    this.municipalities.set(new Map());
    this.defaultRegionsSignal.set([]);
    this.inFlight = null;
    this.countriesRequest = null;
    this.regionsByCountry.clear();
  }

  /** Keeps municipalities returned by a search so their labels can be printed later. */
  remember(municipalities: readonly Municipality[]): void {
    if (municipalities.length === 0) {
      return;
    }
    this.municipalities.update((known) => {
      const next = new Map(known);
      municipalities.forEach((municipality) => next.set(municipality.code, municipality));
      return next;
    });
  }

  /** Cached municipality for a code seen before, or `undefined`. Reactive. */
  municipality(code: string | null): Municipality | undefined {
    return code ? this.municipalities().get(code) : undefined;
  }

  /** "Medellín (Antioquia)" for a code seen before; a dash while it is unknown. Reactive. */
  municipalityLabel(code: string | null): string {
    const municipality = code ? this.municipalities().get(code) : undefined;
    return municipality ? `${municipality.name} (${municipality.regionName})` : UNKNOWN_LABEL;
  }

  /** Looks a code up in the cache and, when it is new, in the API. */
  resolveMunicipality(code: string): Observable<Municipality> {
    const known = this.municipalities().get(code);
    if (known) {
      return of(known);
    }
    return this.repository.municipality(code).pipe(tap((municipality) => this.remember([municipality])));
  }
}
