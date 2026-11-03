import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  CatalogsReader,
  EnsuredNeighborhood,
  GlobalCatalogs,
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
  region: { select: { code: true, name: true } },
} as const;

interface MunicipalityRow {
  code: string | null;
  name: string;
  region: { code: string | null; name: string };
}

function toMunicipalityView(row: MunicipalityRow): MunicipalityView {
  return {
    code: row.code as string,
    name: row.name,
    regionCode: row.region.code ?? '',
    regionName: row.region.name,
  };
}

@Injectable()
export class PrismaCatalogsReader implements CatalogsReader {
  constructor(private readonly prisma: PrismaService) {}

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

  async searchMunicipalities(
    search: string | null,
    limit: number,
  ): Promise<MunicipalityView[]> {
    const rows = await this.prisma.municipality.findMany({
      where: {
        code: { not: null },
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

  async findMunicipality(code: string): Promise<MunicipalityView | null> {
    const row = await this.prisma.municipality.findFirst({
      where: { code },
      select: MUNICIPALITY_SELECT,
    });
    return row ? toMunicipalityView(row) : null;
  }

  async listNeighborhoods(
    municipalityCode: string,
    search: string | null,
    limit: number,
  ): Promise<NeighborhoodView[] | null> {
    const municipalityId = await this.municipalityId(municipalityCode);
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
    municipalityCode: string,
    name: string,
  ): Promise<EnsuredNeighborhood | null> {
    const municipalityId = await this.municipalityId(municipalityCode);
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

  private async municipalityId(code: string): Promise<number | null> {
    const row = await this.prisma.municipality.findFirst({
      where: { code },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}
