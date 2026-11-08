import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PrismaCertificateDonationReader } from './prisma-certificate-donation.reader.js';

const SCOPE = TenantScope.of(1, 10);
const RANGE = { from: '2025-01-01', to: '2025-12-31' };

function fakePrisma(
  overrides: {
    congregation?: { legalEntityId: number } | null;
    member?: { personId: number } | null;
    groups?: unknown[];
    types?: { id: number; name: string; category: string }[];
  } = {},
) {
  const groupBy = vi.fn().mockResolvedValue(overrides.groups ?? []);
  const prisma = {
    congregation: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.congregation === undefined
            ? { legalEntityId: 77 }
            : overrides.congregation,
        ),
    },
    member: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.member === undefined ? { personId: 500 } : overrides.member,
        ),
    },
    contribution: { groupBy },
    contributionType: {
      findMany: vi.fn().mockResolvedValue(overrides.types ?? []),
    },
  };
  return {
    prisma,
    reader: new PrismaCertificateDonationReader(
      prisma as unknown as PrismaService,
    ),
    groupBy,
  };
}

const group = (contributionTypeId: number, amount: string, count: number) => ({
  contributionTypeId,
  _sum: { amount: new Prisma.Decimal(amount) },
  _count: { _all: count },
});

describe('PrismaCertificateDonationReader', () => {
  it('only counts recorded contributions of the person, in the period, of the sedes of the same legal entity', async () => {
    const { reader, groupBy } = fakePrisma();

    await reader.summarize(SCOPE, 42, RANGE);

    const [{ where }] = groupBy.mock.calls[0] as [
      { where: { receivedOn: { gte: Date; lte: Date } } },
    ];
    expect(where).toMatchObject({
      denominationId: 1,
      personId: 500,
      status: 'RECORDED',
      congregation: { legalEntityId: 77 },
    });
    expect(where.receivedOn.gte).toEqual(new Date('2025-01-01T00:00:00.000Z'));
    expect(where.receivedOn.lte).toEqual(new Date('2025-12-31T00:00:00.000Z'));
  });

  it('answers one line per contribution type, in cents, with the usual concepts first', async () => {
    const { reader } = fakePrisma({
      groups: [
        group(3, '90000.50', 2),
        group(1, '1000000', 12),
        group(2, '250000.00', 8),
      ],
      types: [
        { id: 1, name: 'Diezmo', category: 'TITHE' },
        { id: 2, name: 'Ofrenda', category: 'OFFERING' },
        { id: 3, name: 'Voto', category: 'VOW' },
      ],
    });

    await expect(reader.summarize(SCOPE, 42, RANGE)).resolves.toEqual([
      { concept: 'Diezmo', receipts: 12, amountCents: 100_000_000 },
      { concept: 'Ofrenda', receipts: 8, amountCents: 25_000_000 },
      { concept: 'Voto', receipts: 2, amountCents: 9_000_050 },
    ]);
  });

  it('does not lose a cent to floating point', async () => {
    const { reader } = fakePrisma({
      groups: [
        group(1, '0.10', 1),
        group(2, '0.20', 1),
        group(3, '1234567.89', 1),
      ],
      types: [
        { id: 1, name: 'A', category: 'OTHER' },
        { id: 2, name: 'B', category: 'OTHER' },
        { id: 3, name: 'C', category: 'OTHER' },
      ],
    });

    const lines = await reader.summarize(SCOPE, 42, RANGE);

    expect(lines.map((line) => line.amountCents)).toEqual([
      10, 20, 123_456_789,
    ]);
  });

  it('is empty when there are no contributions', async () => {
    const { reader, prisma } = fakePrisma({ groups: [] });

    await expect(reader.summarize(SCOPE, 42, RANGE)).resolves.toEqual([]);
    expect(prisma.contributionType.findMany).not.toHaveBeenCalled();
  });

  it('is empty, and reads no contributions, when the member or the congregation does not exist in the denomination', async () => {
    for (const overrides of [{ member: null }, { congregation: null }]) {
      const { reader, groupBy } = fakePrisma(overrides);

      await expect(reader.summarize(SCOPE, 42, RANGE)).resolves.toEqual([]);
      expect(groupBy).not.toHaveBeenCalled();
    }
  });

  it('is empty in a denomination scope: the certificate belongs to one sede', async () => {
    const { reader, groupBy } = fakePrisma();

    await expect(
      reader.summarize(TenantScope.of(1), 42, RANGE),
    ).resolves.toEqual([]);
    expect(groupBy).not.toHaveBeenCalled();
  });
});
