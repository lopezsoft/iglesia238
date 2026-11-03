import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  PlatformCountryRecord,
  PlatformCountryStore,
} from '../application/catalogs.reader.js';

const COUNTRY_SELECT = {
  id: true,
  isoAlpha2: true,
  isoAlpha3: true,
  name: true,
  isActive: true,
  _count: { select: { regions: true } },
} satisfies Prisma.CountrySelect;

type CountryRow = Prisma.CountryGetPayload<{ select: typeof COUNTRY_SELECT }>;

@Injectable()
export class PrismaPlatformCountryStore implements PlatformCountryStore {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PlatformCountryRecord[]> {
    const [rows, municipalities] = await Promise.all([
      this.prisma.country.findMany({
        select: COUNTRY_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.municipalitiesPerCountry(),
    ]);
    return rows.map((row) => toRecord(row, municipalities.get(row.id) ?? 0));
  }

  async findById(id: number): Promise<PlatformCountryRecord | null> {
    const [row, municipalityCount] = await Promise.all([
      this.prisma.country.findUnique({ where: { id }, select: COUNTRY_SELECT }),
      this.prisma.municipality.count({ where: { region: { countryId: id } } }),
    ]);
    return row ? toRecord(row, municipalityCount) : null;
  }

  countActiveLegalEntities(countryId: number): Promise<number> {
    return this.prisma.legalEntity.count({
      where: { countryId, isActive: true, deletedAt: null },
    });
  }

  async setActive(
    id: number,
    isActive: boolean,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).country.update({
      where: { id },
      data: { isActive },
    });
  }

  /** One grouped query over the regions instead of a count per country. */
  private async municipalitiesPerCountry(): Promise<Map<number, number>> {
    const regions = await this.prisma.region.findMany({
      select: { countryId: true, _count: { select: { municipalities: true } } },
    });
    const totals = new Map<number, number>();
    for (const region of regions) {
      totals.set(
        region.countryId,
        (totals.get(region.countryId) ?? 0) + region._count.municipalities,
      );
    }
    return totals;
  }
}

function toRecord(
  row: CountryRow,
  municipalityCount: number,
): PlatformCountryRecord {
  return {
    id: row.id,
    isoAlpha2: row.isoAlpha2,
    isoAlpha3: row.isoAlpha3,
    name: row.name,
    isActive: row.isActive,
    hasMunicipalities: municipalityCount > 0,
    regionCount: row._count.regions,
    municipalityCount,
  };
}
