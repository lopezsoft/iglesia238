import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PrismaCatalogsReader } from './prisma-catalogs.reader.js';

function readerWith(prisma: object) {
  return new PrismaCatalogsReader(prisma as unknown as PrismaService, 'CO');
}

describe('PrismaCatalogsReader geography', () => {
  it('searches municipalities of active countries only, optionally of one country and region', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        code: '05001',
        name: 'Medellín',
        region: { code: '05', name: 'Antioquia', countryId: 48 },
      },
    ]);
    const reader = readerWith({ municipality: { findMany } });

    const rows = await reader.searchMunicipalities(null, 20, 48);
    await reader.searchMunicipalities(null, 20, null);
    await reader.searchMunicipalities('Med', 15, 48, '05');

    const where = (call: number) =>
      (findMany.mock.calls[call][0] as { where: { region: unknown } }).where
        .region;
    expect(where(0)).toEqual({ country: { isActive: true }, countryId: 48 });
    expect(where(1)).toEqual({ country: { isActive: true } });
    expect(where(2)).toEqual({
      country: { isActive: true },
      countryId: 48,
      code: '05',
    });
    expect(rows).toEqual([
      {
        countryId: 48,
        code: '05001',
        name: 'Medellín',
        regionCode: '05',
        regionName: 'Antioquia',
      },
    ]);
  });

  it('lists the regions of an active country sorted by name', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { countryId: 48, code: '05', name: 'Antioquia' },
    ]);
    const reader = readerWith({ region: { findMany } });

    const regions = await reader.listRegions(48);

    expect(findMany).toHaveBeenCalledWith({
      where: { countryId: 48, code: { not: null }, country: { isActive: true } },
      select: { countryId: true, code: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    expect(regions).toEqual([{ countryId: 48, code: '05', name: 'Antioquia' }]);
  });

  it('resolves a code inside the given country, or inside the default one, never alone', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const reader = readerWith({ municipality: { findFirst } });

    await reader.findMunicipality({ code: '05001', countryId: 48 });
    await reader.findMunicipality({ code: '05001', countryId: null });

    expect(
      findFirst.mock.calls.map((call) => (call[0] as { where: unknown }).where),
    ).toEqual([
      { code: '05001', region: { countryId: 48 } },
      { code: '05001', region: { country: { isoAlpha2: 'CO' } } },
    ]);
  });

  it('lists the active countries by name and tells which ones have municipalities', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 48,
        isoAlpha2: 'CO',
        name: 'Colombia',
        isActive: true,
        regions: [{ id: 1 }],
      },
      { id: 64, isoAlpha2: 'EC', name: 'Ecuador', isActive: true, regions: [] },
    ]);
    const reader = readerWith({ country: { findMany } });

    const countries = await reader.listCountries(false);
    await reader.listCountries(true);

    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    expect(findMany.mock.calls[1][0]).toMatchObject({ where: {} });
    expect(countries).toEqual([
      {
        id: 48,
        isoAlpha2: 'CO',
        name: 'Colombia',
        isActive: true,
        hasMunicipalities: true,
      },
      {
        id: 64,
        isoAlpha2: 'EC',
        name: 'Ecuador',
        isActive: true,
        hasMunicipalities: false,
      },
    ]);
  });
});
