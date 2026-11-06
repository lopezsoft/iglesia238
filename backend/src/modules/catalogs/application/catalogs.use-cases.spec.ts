import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import type {
  CatalogsReader,
  CountryView,
  EnsuredNeighborhood,
  GlobalCatalogs,
  MunicipalityKey,
  MunicipalityView,
  NeighborhoodView,
  RegionView,
} from './catalogs.reader.js';
import {
  EnsureNeighborhoodUseCase,
  GetCatalogsUseCase,
  GetMunicipalityUseCase,
  ListCountriesUseCase,
  ListNeighborhoodsUseCase,
  ListRegionsUseCase,
  MAX_MUNICIPALITY_LIMIT,
  SearchMunicipalitiesUseCase,
} from './catalogs.use-cases.js';

const COLOMBIA_ID = 48;

const COUNTRIES: CountryView[] = [
  {
    id: COLOMBIA_ID,
    isoAlpha2: 'CO',
    name: 'Colombia',
    isActive: true,
    hasMunicipalities: true,
  },
  {
    id: 75,
    isoAlpha2: 'FR',
    name: 'Francia',
    isActive: false,
    hasMunicipalities: false,
  },
];

const REGIONS: RegionView[] = [
  { countryId: COLOMBIA_ID, code: '05', name: 'Antioquia' },
  { countryId: COLOMBIA_ID, code: '13', name: 'Bolívar' },
];

const MEDELLIN: MunicipalityView = {
  countryId: COLOMBIA_ID,
  code: '05001',
  name: 'Medellín',
  regionCode: '05',
  regionName: 'Antioquia',
};

const CATALOGS: GlobalCatalogs = {
  documentTypes: [{ code: 'CC', name: 'Cédula de ciudadanía' }],
  maritalStatuses: [{ code: 'SINGLE', name: 'Soltero(a)' }],
  educationLevels: [{ code: 'PRIMARY', name: 'Primaria' }],
  studyTypes: [{ code: 'COURSE', name: 'Cursos' }],
  meetingTypes: [{ code: 'SUNDAY_SCHOOL', name: 'Escuela Dominical' }],
  attendanceCategories: [{ code: 'CHILDREN', name: 'Niños' }],
};

/** In-memory reader. Catalogs are global: none of its methods receive a tenant. */
class FakeCatalogsReader implements CatalogsReader {
  readonly searches: {
    search: string | null;
    limit: number;
    countryId: number | null;
    regionCode?: string | null;
  }[] = [];
  readonly keys: MunicipalityKey[] = [];
  neighborhoods: NeighborhoodView[] = [];
  private nextId = 100;

  listGlobalCatalogs(): Promise<GlobalCatalogs> {
    return Promise.resolve(CATALOGS);
  }

  listCountries(includeInactive: boolean) {
    return Promise.resolve(
      COUNTRIES.filter((country) => includeInactive || country.isActive),
    );
  }

  listRegions(countryId?: number | null) {
    const resolvedCountryId = countryId ?? COLOMBIA_ID;
    return Promise.resolve(
      REGIONS.filter((region) => region.countryId === resolvedCountryId),
    );
  }

  searchMunicipalities(
    search: string | null,
    limit: number,
    countryId: number | null,
    regionCode?: string | null,
  ) {
    this.searches.push({
      search,
      limit,
      countryId,
      ...(regionCode !== undefined ? { regionCode } : {}),
    });
    return Promise.resolve([MEDELLIN]);
  }

  /** Null country = the default one (Colombia in these tests). */
  private matches(key: MunicipalityKey): boolean {
    this.keys.push(key);
    return (
      key.code === MEDELLIN.code &&
      (key.countryId ?? COLOMBIA_ID) === MEDELLIN.countryId
    );
  }

  findMunicipality(key: MunicipalityKey) {
    return Promise.resolve(this.matches(key) ? MEDELLIN : null);
  }

  listNeighborhoods(key: MunicipalityKey, search: string | null) {
    if (!this.matches(key)) {
      return Promise.resolve(null);
    }
    const needle = search?.toLowerCase();
    return Promise.resolve(
      this.neighborhoods.filter(
        (item) => !needle || item.name.toLowerCase().includes(needle),
      ),
    );
  }

  ensureNeighborhood(
    key: MunicipalityKey,
    name: string,
  ): Promise<EnsuredNeighborhood | null> {
    if (!this.matches(key)) {
      return Promise.resolve(null);
    }
    const existing = this.neighborhoods.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      return Promise.resolve({ ...existing, created: false });
    }
    const created = { id: this.nextId++, name };
    this.neighborhoods.push(created);
    return Promise.resolve({ ...created, created: true });
  }
}

describe('catalog use cases', () => {
  let reader: FakeCatalogsReader;

  beforeEach(() => {
    reader = new FakeCatalogsReader();
  });

  describe('GetCatalogsUseCase', () => {
    it('returns every global catalog to a signed-in user', async () => {
      const result = await new GetCatalogsUseCase(reader).all();

      expect(Object.keys(result)).toEqual(Object.keys(CATALOGS));
    });

    it('limits the public answer to what the application form shows', async () => {
      const result = await new GetCatalogsUseCase(reader).publicSubset();

      expect(Object.keys(result)).toEqual([
        'documentTypes',
        'maritalStatuses',
        'educationLevels',
      ]);
    });
  });

  describe('SearchMunicipalitiesUseCase', () => {
    it('trims the text and uses a default limit', async () => {
      await new SearchMunicipalitiesUseCase(reader).execute(
        '  Medel ',
        undefined,
      );

      expect(reader.searches[0]).toEqual({
        search: 'Medel',
        limit: 20,
        countryId: null,
      });
    });

    it('narrows the search to one country and region when given', async () => {
      await new SearchMunicipalitiesUseCase(reader).execute(
        'Medel',
        5,
        COLOMBIA_ID,
        ' 05 ',
      );

      expect(reader.searches[0]).toEqual({
        search: 'Medel',
        limit: 5,
        countryId: COLOMBIA_ID,
        regionCode: '05',
      });
    });

    it('treats blank text as no filter and caps the limit', async () => {
      const search = new SearchMunicipalitiesUseCase(reader);

      await search.execute('   ', 5000);
      await search.execute(undefined, 0);

      expect(reader.searches[0]).toEqual({
        search: null,
        limit: MAX_MUNICIPALITY_LIMIT,
        countryId: null,
      });
      expect(reader.searches[1].limit).toBe(1);
    });
  });

  describe('ListCountriesUseCase and ListRegionsUseCase', () => {
    const platformAdmin = buildTenantContext({
      kind: 'PLATFORM',
      permissions: ['denominations.manage'],
    });

    it('lists only the active countries to any session', async () => {
      const countries = await new ListCountriesUseCase(reader).execute(
        false,
        null,
      );

      expect(countries).toEqual([COUNTRIES[0]]);
    });

    it('lists the regions of a country', async () => {
      const regions = await new ListRegionsUseCase(reader).execute(COLOMBIA_ID);

      expect(regions).toEqual(REGIONS);
    });

    it('adds the inactive ones only for the platform team', async () => {
      const list = new ListCountriesUseCase(reader);

      await expect(list.execute(true, platformAdmin)).resolves.toHaveLength(2);
      for (const tenant of [
        null,
        buildTenantContext({
          kind: 'DENOMINATION',
          permissions: ['congregations.manage'],
        }),
        buildTenantContext({ kind: 'PLATFORM', permissions: ['users.manage'] }),
      ]) {
        await expect(list.execute(true, tenant)).rejects.toBeInstanceOf(
          ForbiddenDomainException,
        );
      }
    });
  });

  describe('GetMunicipalityUseCase', () => {
    it('returns the municipality with its region and country', async () => {
      await expect(
        new GetMunicipalityUseCase(reader).execute('05001'),
      ).resolves.toEqual(MEDELLIN);
      expect(reader.keys[0]).toEqual({ code: '05001', countryId: null });
    });

    it('looks the code up inside the country it is given', async () => {
      const get = new GetMunicipalityUseCase(reader);

      await expect(get.execute('05001', COLOMBIA_ID)).resolves.toEqual(
        MEDELLIN,
      );
      await expect(get.execute('05001', 75)).rejects.toBeInstanceOf(
        NotFoundDomainException,
      );
    });

    it('answers not found for an unknown code', async () => {
      await expect(
        new GetMunicipalityUseCase(reader).execute('99999'),
      ).rejects.toBeInstanceOf(NotFoundDomainException);
    });
  });

  describe('neighborhoods', () => {
    it('creates a neighborhood once and finds it the next time', async () => {
      const ensure = new EnsureNeighborhoodUseCase(reader);

      const first = await ensure.execute('05001', '  Laureles   Estadio ');
      const second = await ensure.execute('05001', 'laureles estadio');

      expect(first).toMatchObject({ name: 'Laureles Estadio', created: true });
      expect(second).toMatchObject({ id: first.id, created: false });
    });

    it('rejects names that are too short or too long', async () => {
      const ensure = new EnsureNeighborhoodUseCase(reader);

      await expect(ensure.execute('05001', ' a ')).rejects.toBeInstanceOf(
        InvalidInputException,
      );
      await expect(
        ensure.execute('05001', 'x'.repeat(121)),
      ).rejects.toBeInstanceOf(InvalidInputException);
    });

    it('answers not found for an unknown municipality', async () => {
      await expect(
        new EnsureNeighborhoodUseCase(reader).execute('99999', 'Centro'),
      ).rejects.toBeInstanceOf(NotFoundDomainException);
      await expect(
        new ListNeighborhoodsUseCase(reader).execute(
          '99999',
          undefined,
          undefined,
        ),
      ).rejects.toBeInstanceOf(NotFoundDomainException);
    });

    it('lists and filters the neighborhoods of a municipality', async () => {
      await new EnsureNeighborhoodUseCase(reader).execute('05001', 'Laureles');
      await new EnsureNeighborhoodUseCase(reader).execute('05001', 'Belén');

      const list = new ListNeighborhoodsUseCase(reader);

      expect(await list.execute('05001', undefined, undefined)).toHaveLength(2);
      expect(await list.execute('05001', 'laur', undefined)).toEqual([
        expect.objectContaining({ name: 'Laureles' }),
      ]);
    });
  });
});
