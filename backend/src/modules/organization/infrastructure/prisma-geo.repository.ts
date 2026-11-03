import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  GeoRepository,
  MunicipalityRef,
  NeighborhoodRef,
} from '../application/organization.ports.js';

@Injectable()
export class PrismaGeoRepository implements GeoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMunicipalityByCode(code: string): Promise<MunicipalityRef | null> {
    // DIVIPOLA codes are unique across Colombia; the seed only loads that country's divisions.
    const row = await this.prisma.municipality.findFirst({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        region: { select: { name: true } },
      },
    });
    return row
      ? {
          id: row.id,
          code: row.code ?? code,
          name: row.name,
          regionName: row.region.name,
        }
      : null;
  }

  async findOrCreateNeighborhood(
    municipalityId: number,
    name: string,
    transaction: Transaction,
  ): Promise<NeighborhoodRef> {
    const client = clientOf(this.prisma, transaction);
    // The unique index ignores case and accents through the collation, so this reuses "Centro" for "centro".
    return client.neighborhood.upsert({
      where: { municipalityId_name: { municipalityId, name } },
      create: { municipalityId, name },
      update: {},
      select: { id: true, name: true },
    });
  }
}
