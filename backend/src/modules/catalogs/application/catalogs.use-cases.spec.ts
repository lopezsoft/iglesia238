import {
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import type {
  CatalogsReader,
  EnsuredNeighborhood,
  GlobalCatalogs,
  MunicipalityView,
  NeighborhoodView,
} from './catalogs.reader.js';
import {
  EnsureNeighborhoodUseCase,
  GetCatalogsUseCase,
  GetMunicipalityUseCase,
  ListNeighborhoodsUseCase,
  MAX_MUNICIPALITY_LIMIT,
  SearchMunicipalitiesUseCase,
} from './catalogs.use-cases.js';

const MEDELLIN: MunicipalityView = {
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
  readonly searches: { search: string | null; limit: number }[] = [];
  neighborhoods: NeighborhoodView[] = [];
  private nextId = 100;

  listGlobalCatalogs(): Promise<GlobalCatalogs> {
    return Promise.resolve(CATALOGS);
  }

  searchMunicipalities(search: string | null, limit: number) {
    this.searches.push({ search, limit });
    return Promise.resolve([MEDELLIN]);
  }

  findMunicipality(code: string) {
    return Promise.resolve(code === MEDELLIN.code ? MEDELLIN : null);
  }

  listNeighborhoods(code: string, search: string | null) {
    if (code !== MEDELLIN.code) {
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
    code: string,
    name: string,
  ): Promise<EnsuredNeighborhood | null> {
    if (code !== MEDELLIN.code) {
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

      expect(Object.keys(result)).toEqual(['documentTypes', 'maritalStatuses']);
    });
  });

  describe('SearchMunicipalitiesUseCase', () => {
    it('trims the text and uses a default limit', async () => {
      await new SearchMunicipalitiesUseCase(reader).execute(
        '  Medel ',
        undefined,
      );

      expect(reader.searches[0]).toEqual({ search: 'Medel', limit: 20 });
    });

    it('treats blank text as no filter and caps the limit', async () => {
      const search = new SearchMunicipalitiesUseCase(reader);

      await search.execute('   ', 5000);
      await search.execute(undefined, 0);

      expect(reader.searches[0]).toEqual({
        search: null,
        limit: MAX_MUNICIPALITY_LIMIT,
      });
      expect(reader.searches[1].limit).toBe(1);
    });
  });

  describe('GetMunicipalityUseCase', () => {
    it('returns the municipality with its region', async () => {
      await expect(
        new GetMunicipalityUseCase(reader).execute('05001'),
      ).resolves.toEqual(MEDELLIN);
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
