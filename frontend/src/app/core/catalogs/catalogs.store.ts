import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, of, shareReplay, tap, throwError } from 'rxjs';
import { Country, Municipality } from '../models/catalogs';
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
  private inFlight: Observable<Catalogs> | null = null;
  private countriesRequest: Observable<readonly Country[]> | null = null;

  readonly isLoaded = computed(() => this.loaded() !== null);
  readonly documentTypes = computed(() => this.loaded()?.documentTypes ?? []);
  readonly maritalStatuses = computed(() => this.loaded()?.maritalStatuses ?? []);
  readonly educationLevels = computed(() => this.loaded()?.educationLevels ?? []);
  readonly studyTypes = computed(() => this.loaded()?.studyTypes ?? []);
  readonly meetingTypes = computed(() => this.loaded()?.meetingTypes ?? []);
  readonly attendanceCategories = computed(() => this.loaded()?.attendanceCategories ?? []);

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
    this.countriesRequest ??= this.repository.countries().pipe(
      catchError((error: unknown) => {
        this.countriesRequest = null;
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.countriesRequest;
  }

  /** Asks the API again on the next `loadCountries()` (a country was activated or deactivated). */
  forgetCountries(): void {
    this.countriesRequest = null;
  }

  /** Forgets everything (a new session may see different data). */
  reset(): void {
    this.loaded.set(null);
    this.municipalities.set(new Map());
    this.inFlight = null;
    this.countriesRequest = null;
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
