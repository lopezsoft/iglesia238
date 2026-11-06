import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CatalogsRepository } from './catalogs.repository';
import { CatalogsStore } from './catalogs.store';
import { HttpCatalogsRepository } from './http-catalogs.repository';

const CATALOGS = {
  documentTypes: [{ code: 'CC', name: 'Cédula de ciudadanía' }],
  maritalStatuses: [{ code: 'SINGLE', name: 'Soltero(a)' }],
  educationLevels: [{ code: 'PRIMARY', name: 'Primaria' }],
  studyTypes: [{ code: 'COURSE', name: 'Cursos' }],
  meetingTypes: [{ code: 'SUNDAY_SCHOOL', name: 'Escuela Dominical' }],
  attendanceCategories: [{ code: 'CHILDREN', name: 'Niños' }],
};
const ANTIOQUIA = { countryId: 1, code: '05', name: 'Antioquia' };
const MEDELLIN = { code: '05001', name: 'Medellín', regionCode: '05', regionName: 'Antioquia' };

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CatalogsRepository, useClass: HttpCatalogsRepository },
    ],
  });
  return {
    repository: TestBed.inject(CatalogsRepository),
    store: TestBed.inject(CatalogsStore),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('HttpCatalogsRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads the catalogs', async () => {
    const { repository, http } = setup();

    const all = firstValueFrom(repository.catalogs());
    http.expectOne('/api/catalogs').flush(CATALOGS);
    expect(await all).toEqual(CATALOGS);
  });

  it('searches municipalities with the text and the limit, signed in or public', async () => {
    const { repository, http } = setup();

    const signedIn = firstValueFrom(repository.searchMunicipalities({ search: ' Medel ', limit: 10 }));
    const request = http.expectOne((req) => req.url === '/api/geo/municipalities');
    expect(request.request.params.get('search')).toBe('Medel');
    expect(request.request.params.get('limit')).toBe('10');
    request.flush([MEDELLIN]);
    expect(await signedIn).toEqual([MEDELLIN]);

    const anonymous = firstValueFrom(repository.searchMunicipalities({ search: '', publicAccess: true }));
    const publicRequest = http.expectOne((req) => req.url === '/api/public/geo/municipalities');
    expect(publicRequest.request.params.has('search')).toBe(false);
    publicRequest.flush([]);
    await anonymous;
  });

  it('lists the countries, regions and filters the municipalities by country and region', async () => {
    const { repository, http } = setup();
    const colombia = { id: 1, isoAlpha2: 'CO', name: 'Colombia', hasMunicipalities: true };

    const countries = firstValueFrom(repository.countries());
    const countriesRequest = http.expectOne('/api/geo/countries');
    expect(countriesRequest.request.method).toBe('GET');
    countriesRequest.flush([colombia]);
    expect(await countries).toEqual([colombia]);

    const regions = firstValueFrom(repository.regions(1));
    const regionsRequest = http.expectOne((req) => req.url === '/api/geo/regions');
    expect(regionsRequest.request.params.get('countryId')).toBe('1');
    regionsRequest.flush([ANTIOQUIA]);
    expect(await regions).toEqual([ANTIOQUIA]);

    const filtered = firstValueFrom(
      repository.searchMunicipalities({ search: 'med', countryId: 1, regionCode: '05' }),
    );
    const request = http.expectOne((req) => req.url === '/api/geo/municipalities');
    expect(request.request.params.get('countryId')).toBe('1');
    expect(request.request.params.get('regionCode')).toBe('05');
    request.flush([MEDELLIN]);
    await filtered;

    const unfiltered = firstValueFrom(
      repository.searchMunicipalities({ search: 'chi', countryId: null, regionCode: null }),
    );
    const unfilteredRequest = http.expectOne((req) => req.url === '/api/geo/municipalities');
    expect(unfilteredRequest.request.params.has('countryId')).toBe(false);
    expect(unfilteredRequest.request.params.has('regionCode')).toBe(false);
    unfilteredRequest.flush([]);
    await unfiltered;
  });

  it('finds a municipality by code', async () => {
    const { repository, http } = setup();

    const municipality = firstValueFrom(repository.municipality('05001'));
    http.expectOne('/api/geo/municipalities/05001').flush(MEDELLIN);
    expect(await municipality).toEqual(MEDELLIN);
  });
});

describe('CatalogsStore', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads once and serves the signals afterwards', async () => {
    const { store, http } = setup();
    expect(store.isLoaded()).toBe(false);
    expect(store.documentTypes()).toEqual([]);

    const first = firstValueFrom(store.load());
    const second = firstValueFrom(store.load());
    http.expectOne('/api/catalogs').flush(CATALOGS);
    await Promise.all([first, second]);

    expect(store.isLoaded()).toBe(true);
    expect(store.documentTypes()).toEqual(CATALOGS.documentTypes);
    expect(store.attendanceCategories()[0].name).toBe('Niños');

    await firstValueFrom(store.load());
    http.expectNone('/api/catalogs');
  });

  it('tries again after a failed load', async () => {
    const { store, http } = setup();

    const failed = firstValueFrom(store.load()).catch((error: unknown) => error);
    http.expectOne('/api/catalogs').flush({}, { status: 503, statusText: 'Service Unavailable' });
    expect(await failed).toBeDefined();

    const retry = firstValueFrom(store.load());
    http.expectOne('/api/catalogs').flush(CATALOGS);
    await retry;
    expect(store.isLoaded()).toBe(true);
  });

  it('prints the label of a municipality it has seen, and resolves new codes through the API once', async () => {
    const { store, http } = setup();
    expect(store.municipalityLabel('05001')).toBe('—');

    const resolved = firstValueFrom(store.resolveMunicipality('05001'));
    http.expectOne('/api/geo/municipalities/05001').flush(MEDELLIN);
    await resolved;

    expect(store.municipalityLabel('05001')).toBe('Medellín (Antioquia)');
    expect(store.municipality('05001')?.regionCode).toBe('05');
    expect(store.municipalityLabel(null)).toBe('—');
    await firstValueFrom(store.resolveMunicipality('05001'));
    http.expectNone('/api/geo/municipalities/05001');
  });

  it('asks for the countries and regions once and again after a failure', async () => {
    const { store, http } = setup();

    const failed = firstValueFrom(store.loadCountries()).catch((error: unknown) => error);
    http.expectOne('/api/geo/countries').flush({}, { status: 503, statusText: 'Service Unavailable' });
    expect(await failed).toBeDefined();

    const first = firstValueFrom(store.loadCountries());
    http.expectOne('/api/geo/countries').flush([{ id: 1, isoAlpha2: 'CO', name: 'Colombia', hasMunicipalities: true }]);
    expect((await first)[0].name).toBe('Colombia');

    await firstValueFrom(store.loadCountries());
    http.expectNone('/api/geo/countries');

    const regionsFirst = firstValueFrom(store.loadRegions(1));
    const regionsRequest = http.expectOne((req) => req.url === '/api/geo/regions');
    expect(regionsRequest.request.params.get('countryId')).toBe('1');
    regionsRequest.flush([ANTIOQUIA]);
    expect(await regionsFirst).toEqual([ANTIOQUIA]);

    await firstValueFrom(store.loadRegions(1));
    http.expectNone('/api/geo/regions');
  });

  it('forgets the catalogs on reset', async () => {
    const { store, http } = setup();
    const loading = firstValueFrom(store.load());
    http.expectOne('/api/catalogs').flush(CATALOGS);
    await loading;

    store.reset();

    expect(store.isLoaded()).toBe(false);
  });
});
