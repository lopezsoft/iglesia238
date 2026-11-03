import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_COUNTRY_ISO } from '../../../common/geo/default-country.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  CatalogsReader,
  CountryView,
  EnsuredNeighborhood,
  GlobalCatalogs,
  MunicipalityKey,
  MunicipalityView,
  NeighborhoodView,
} from '../application/catalogs.reader.js';

/** Document type used internally for people without a document; it is never offered in a form. */
const INTERNAL_DOCUMENT_TYPE_CODE = 'UNKNOWN';
const UNIQUE_VIOLATION = 'P2002';

const ENTRY_SELECT = { code: true, name: true } as const;
const BY_SEED_ORDER = { id: 'asc' } as const;

const MUNICIPALITY_SELECT = {
  code: true,
  name: true,
  region: { select: { code: true, name: true, countryId: true } },
} as const;

interface MunicipalityRow {
  code: string | null;
  name: string;
  region: { code: string | null; name: string; countryId: number };
}

function toMunicipalityView(row: MunicipalityRow): MunicipalityView {
  return {
    countryId: row.region.countryId,
    code: row.code as string,
    name: row.name,
    regionCode: row.region.code ?? '',
    regionName: row.region.name,
  };
}

@Injectable()
export class PrismaCatalogsReader implements CatalogsReader {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DEFAULT_COUNTRY_ISO) private readonly defaultCountryIso: string,
  ) {}

  /** The country part of a municipality lookup: never the code alone (codes repeat across countries). */
  private countryOf(key: MunicipalityKey): Prisma.RegionWhereInput {
    return key.countryId === null
      ? { country: { isoAlpha2: this.defaultCountryIso } }
      : { countryId: key.countryId };
  }

  async listGlobalCatalogs(): Promise<GlobalCatalogs> {
    const [
      documentTypes,
      maritalStatuses,
      educationLevels,
      studyTypes,
      meetingTypes,
      attendanceCategories,
    ] = await Promise.all([
      this.prisma.documentType.findMany({
        where: { code: { not: INTERNAL_DOCUMENT_TYPE_CODE } },
        select: ENTRY_SELECT,
        orderBy: BY_SEED_ORDER,
      }),
      this.prisma.maritalStatus.findMany({
        select: ENTRY_SELECT,
        orderBy: BY_SEED_ORDER,
      }),
      this.prisma.educationLevel.findMany({
        select: ENTRY_SELECT,
        orderBy: BY_SEED_ORDER,
      }),
      this.prisma.studyType.findMany({
        select: ENTRY_SELECT,
        orderBy: BY_SEED_ORDER,
      }),
      this.prisma.meetingType.findMany({
        select: ENTRY_SELECT,
        orderBy: BY_SEED_ORDER,
      }),
      this.prisma.attendanceCategory.findMany({
        select: ENTRY_SELECT,
        orderBy: BY_SEED_ORDER,
      }),
    ]);
    return {
      documentTypes,
      maritalStatuses,
      educationLevels,
      studyTypes,
      meetingTypes,
      attendanceCategories,
    };
  }

  async listCountries(includeInactive: boolean): Promise<CountryView[]> {
    const rows = await this.prisma.country.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: {
        id: true,
        isoAlpha2: true,
        name: true,
        isActive: true,
        // One region with municipalities is enough to know the country has them.
        regions: {
          where: { municipalities: { some: {} } },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(({ regions, ...country }) => ({
      ...country,
      hasMunicipalities: regions.length > 0,
    }));
  }

  async searchMunicipalities(
    search: string | null,
    limit: number,
    countryId: number | null,
  ): Promise<MunicipalityView[]> {
    const rows = await this.prisma.municipality.findMany({
      where: {
        code: { not: null },
        // Only the countries the platform offers.
        region: {
          country: { isActive: true },
          ...(countryId === null ? {} : { countryId }),
        },
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { code: { startsWith: search } },
              ],
            }
          : {}),
      },
      select: MUNICIPALITY_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toMunicipalityView);
  }

  async findMunicipality(
    key: MunicipalityKey,
  ): Promise<MunicipalityView | null> {
    const row = await this.prisma.municipality.findFirst({
      where: { code: key.code, region: this.countryOf(key) },
      select: MUNICIPALITY_SELECT,
    });
    return row ? toMunicipalityView(row) : null;
  }

  async listNeighborhoods(
    key: MunicipalityKey,
    search: string | null,
    limit: number,
  ): Promise<NeighborhoodView[] | null> {
    const municipalityId = await this.municipalityId(key);
    if (municipalityId === null) {
      return null;
    }
    return this.prisma.neighborhood.findMany({
      where: {
        municipalityId,
        ...(search ? { name: { contains: search } } : {}),
      },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  async ensureNeighborhood(
    key: MunicipalityKey,
    name: string,
  ): Promise<EnsuredNeighborhood | null> {
    const municipalityId = await this.municipalityId(key);
    if (municipalityId === null) {
      return null;
    }

    const existing = await this.findNeighborhood(municipalityId, name);
    if (existing) {
      return { ...existing, created: false };
    }
    try {
      const created = await this.prisma.neighborhood.create({
        data: { municipalityId, name },
        select: { id: true, name: true },
      });
      return { ...created, created: true };
    } catch (error) {
      // Somebody typed the same name an instant ago: the unique key (municipality, name) decided.
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) {
        throw error;
      }
      const winner = await this.findNeighborhood(municipalityId, name);
      if (!winner) {
        throw error;
      }
      return { ...winner, created: false };
    }
  }

  private findNeighborhood(municipalityId: number, name: string) {
    return this.prisma.neighborhood.findFirst({
      where: { municipalityId, name },
      select: { id: true, name: true },
    });
  }

  private async municipalityId(key: MunicipalityKey): Promise<number | null> {
    const row = await this.prisma.municipality.findFirst({
      where: { code: key.code, region: this.countryOf(key) },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}
