import {
  ImmediateTransactionRunner,
  RecordingAuditRecorder,
} from '../../../../test/support/foundation-fakes.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  ForbiddenDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import type {
  PlatformCountryRecord,
  PlatformCountryStore,
} from './catalogs.reader.js';
import {
  ListPlatformCountriesUseCase,
  SetCountryActiveUseCase,
} from './platform-countries.use-cases.js';

/** Countries and the active legal entities that live in each one. */
class InMemoryCountryStore implements PlatformCountryStore {
  countries: PlatformCountryRecord[] = [
    {
      id: 48,
      isoAlpha2: 'CO',
      isoAlpha3: 'COL',
      name: 'Colombia',
      isActive: true,
      hasMunicipalities: true,
      regionCount: 33,
      municipalityCount: 1122,
    },
    {
      id: 64,
      isoAlpha2: 'EC',
      isoAlpha3: 'ECU',
      name: 'Ecuador',
      isActive: true,
      hasMunicipalities: false,
      regionCount: 0,
      municipalityCount: 0,
    },
    {
      id: 75,
      isoAlpha2: 'FR',
      isoAlpha3: 'FRA',
      name: 'Francia',
      isActive: false,
      hasMunicipalities: false,
      regionCount: 0,
      municipalityCount: 0,
    },
  ];
  activeLegalEntities = new Map<number, number>([[48, 2]]);

  list() {
    return Promise.resolve([...this.countries]);
  }

  findById(id: number) {
    return Promise.resolve(this.countries.find((row) => row.id === id) ?? null);
  }

  countActiveLegalEntities(countryId: number) {
    return Promise.resolve(this.activeLegalEntities.get(countryId) ?? 0);
  }

  setActive(id: number, isActive: boolean) {
    this.countries = this.countries.map((row) =>
      row.id === id ? { ...row, isActive } : row,
    );
    return Promise.resolve();
  }
}

const platform = buildTenantContext({
  kind: 'PLATFORM',
  permissions: ['denominations.manage'],
});
const denominationAdmin = buildTenantContext({
  kind: 'DENOMINATION',
  permissions: ['congregations.manage'],
});
const command = { ipAddress: '10.1.1.1' };

function build() {
  const store = new InMemoryCountryStore();
  const audit = new RecordingAuditRecorder();
  return {
    store,
    audit,
    list: new ListPlatformCountriesUseCase(store),
    setActive: new SetCountryActiveUseCase(
      store,
      new ImmediateTransactionRunner(),
      audit,
    ),
  };
}

describe('ListPlatformCountriesUseCase', () => {
  it('lists every country, active or not, with its loaded geography', async () => {
    const { list } = build();

    const countries = await list.execute(platform);

    expect(countries.map((row) => row.isoAlpha2)).toEqual(['CO', 'EC', 'FR']);
    expect(countries[0]).toMatchObject({
      isActive: true,
      hasMunicipalities: true,
      regionCount: 33,
      municipalityCount: 1122,
    });
  });

  it('is closed to a session that is not at platform scope', async () => {
    await expect(
      build().list.execute(denominationAdmin),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });
});

describe('SetCountryActiveUseCase', () => {
  it('activates a country and audits it as the platform user', async () => {
    const { setActive, audit } = build();

    const country = await setActive.execute({
      ...command,
      context: platform,
      id: 75,
      isActive: true,
    });

    expect(country.isActive).toBe(true);
    expect(audit.entries).toEqual([
      expect.objectContaining({
        action: 'ACTIVATE',
        entity: 'Country',
        entityId: 75,
        actor: { userId: 7, denominationId: null, congregationId: null },
        changes: { isActive: { from: false, to: true } },
        ipAddress: '10.1.1.1',
      }),
    ]);
  });

  it('deactivates a country without active legal entities', async () => {
    const { setActive, audit } = build();

    await expect(
      setActive.execute({
        ...command,
        context: platform,
        id: 64,
        isActive: false,
      }),
    ).resolves.toMatchObject({ isActive: false });
    expect(audit.entries[0]).toMatchObject({ action: 'DEACTIVATE' });
  });

  it('answers 409 COUNTRY_IN_USE while active legal entities live in the country', async () => {
    const { setActive, store, audit } = build();

    await expect(
      setActive.execute({
        ...command,
        context: platform,
        id: 48,
        isActive: false,
      }),
    ).rejects.toMatchObject({ code: 'COUNTRY_IN_USE' });
    expect(store.countries[0].isActive).toBe(true);
    expect(audit.entries).toHaveLength(0);
  });

  it('is a no-op when the state does not change, 404 for an unknown country and closed outside the platform', async () => {
    const { setActive, audit } = build();

    await expect(
      setActive.execute({
        ...command,
        context: platform,
        id: 48,
        isActive: true,
      }),
    ).resolves.toMatchObject({ isActive: true });
    expect(audit.entries).toHaveLength(0);
    await expect(
      setActive.execute({
        ...command,
        context: platform,
        id: 999,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      setActive.execute({
        ...command,
        context: denominationAdmin,
        id: 75,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });
});
