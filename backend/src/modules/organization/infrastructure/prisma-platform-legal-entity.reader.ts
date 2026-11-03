import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  PlatformDenominationRef,
  PlatformLegalEntityReader,
  PlatformLegalEntityRecord,
} from '../application/organization.ports.js';

const PLATFORM_SELECT = {
  id: true,
  denominationId: true,
  legalName: true,
  tradeName: true,
  taxId: true,
  legalRepresentative: true,
  email: true,
  phone: true,
  address: true,
  countryId: true,
  isActive: true,
  createdAt: true,
  denomination: { select: { name: true } },
  country: { select: { name: true } },
  municipality: {
    select: { code: true, name: true, region: { select: { name: true } } },
  },
  _count: { select: { congregations: { where: { deletedAt: null } } } },
} satisfies Prisma.LegalEntitySelect;

type PlatformRow = Prisma.LegalEntityGetPayload<{
  select: typeof PLATFORM_SELECT;
}>;

function toRecord(row: PlatformRow): PlatformLegalEntityRecord {
  return {
    id: row.id,
    denominationId: row.denominationId,
    denominationName: row.denomination.name,
    legalName: row.legalName,
    tradeName: row.tradeName,
    taxId: row.taxId,
    legalRepresentative: row.legalRepresentative,
    email: row.email,
    phone: row.phone,
    address: row.address,
    countryId: row.countryId,
    countryName: row.country.name,
    municipalityCode: row.municipality?.code ?? null,
    municipalityName: row.municipality?.name ?? null,
    regionName: row.municipality?.region.name ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt,
    congregationCount: row._count.congregations,
  };
}

/** Cross-denomination read for the platform team (structure only: no members, no finances). */
@Injectable()
export class PrismaPlatformLegalEntityReader implements PlatformLegalEntityReader {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    denominationId: number | null,
  ): Promise<PlatformLegalEntityRecord[]> {
    const rows = await this.prisma.legalEntity.findMany({
      where: {
        deletedAt: null,
        denomination: { deletedAt: null },
        ...(denominationId === null ? {} : { denominationId }),
      },
      select: PLATFORM_SELECT,
      orderBy: [
        { denomination: { name: 'asc' } },
        { legalName: 'asc' },
        { id: 'asc' },
      ],
    });
    return rows.map(toRecord);
  }

  async findById(id: number): Promise<PlatformLegalEntityRecord | null> {
    const row = await this.prisma.legalEntity.findFirst({
      where: { id, deletedAt: null, denomination: { deletedAt: null } },
      select: PLATFORM_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  findDenomination(id: number): Promise<PlatformDenominationRef | null> {
    return this.prisma.denomination.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, isActive: true },
    });
  }
}
