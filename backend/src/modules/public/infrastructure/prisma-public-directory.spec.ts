import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PrismaPublicDirectory } from './prisma-public-directory.js';

describe('PrismaPublicDirectory', () => {
  it('lists only active legal entities of active denominations whose country is active, with the country', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 12,
        legalName: 'Corporación Uno',
        tradeName: null,
        taxId: '900.123.456-7',
        denominationId: 1,
        countryId: 48,
        denomination: { name: 'Denominación Uno' },
        country: { name: 'Colombia' },
      },
    ]);
    const directory = new PrismaPublicDirectory(
      { legalEntity: { findMany } } as unknown as PrismaService,
      'CO',
    );

    const rows = await directory.listLegalEntities();

    expect((findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({
      isActive: true,
      deletedAt: null,
      denomination: { isActive: true, deletedAt: null },
      country: { isActive: true },
    });
    expect(rows[0]).toMatchObject({ countryId: 48, countryName: 'Colombia' });
  });

  it('checks the municipality of the application form inside the default country', async () => {
    const count = vi.fn().mockResolvedValue(1);
    const directory = new PrismaPublicDirectory(
      { municipality: { count } } as unknown as PrismaService,
      'CO',
    );

    await expect(directory.municipalityExists('13001')).resolves.toBe(true);
    expect(count).toHaveBeenCalledWith({
      where: { code: '13001', region: { country: { isoAlpha2: 'CO' } } },
    });
  });
});
