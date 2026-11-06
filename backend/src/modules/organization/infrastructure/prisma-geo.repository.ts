import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  CountryRef,
  GeoRepository,
  MunicipalityRef,
  NeighborhoodRef,
} from '../application/organization.ports.js';

@Injectable()
export class PrismaGeoRepository implements GeoRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCountry(id: number): Promise<CountryRef | null> {
    return this.prisma.country.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });
  }

  async findMunicipality(
    countryId: number,
    code: string,
  ): Promise<MunicipalityRef | null> {
    // Codes are unique per region, so the country is part of the key (in Colombia, DIVIPOLA codes).
    const row = await this.prisma.municipality.findFirst({
      where: { code, region: { countryId } },
      select: {
        id: true,
        code: true,
        name: true,
        region: { select: { code: true, name: true, countryId: true } },
      },
    });
    return row
      ? {
          id: row.id,
          countryId: row.region.countryId,
          code: row.code ?? code,
          name: row.name,
          regionCode: row.region.code,
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
