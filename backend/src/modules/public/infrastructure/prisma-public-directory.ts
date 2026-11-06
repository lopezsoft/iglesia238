import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_COUNTRY_ISO } from '../../../common/geo/default-country.js';
import {
  parseIsoDate,
  toIsoDate,
} from '../../../common/mappers/value-mappers.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  CongregationTarget,
  CurrentPolicyRecord,
  OpenCongregationRecord,
  PublicDirectory,
  PublicLegalEntityRecord,
} from '../application/ports/public-directory.reader.js';

@Injectable()
export class PrismaPublicDirectory implements PublicDirectory {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DEFAULT_COUNTRY_ISO) private readonly defaultCountryIso: string,
  ) {}

  async listOpenCongregations(
    today: string,
  ): Promise<readonly OpenCongregationRecord[]> {
    const rows = await this.prisma.congregation.findMany({
      where: {
        isActive: true,
        acceptsApplications: true,
        deletedAt: null,
        denomination: {
          isActive: true,
          deletedAt: null,
          // Without a policy in force the form cannot collect a valid consent.
          privacyPolicies: {
            some: {
              status: 'PUBLISHED',
              effectiveFrom: { lte: parseIsoDate(today) },
            },
          },
        },
      },
      orderBy: [{ denomination: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        denominationId: true,
        name: true,
        address: true,
        denomination: { select: { name: true } },
        municipality: {
          select: {
            code: true,
            name: true,
            region: { select: { name: true, countryId: true } },
          },
        },
        neighborhood: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      denominationId: row.denominationId,
      denominationName: row.denomination.name,
      countryId: row.municipality.region.countryId,
      name: row.name,
      municipalityCode: row.municipality.code,
      municipalityName: row.municipality.name,
      regionName: row.municipality.region.name,
      neighborhood: row.neighborhood?.name ?? null,
      address: row.address,
    }));
  }

  async listLegalEntities(): Promise<readonly PublicLegalEntityRecord[]> {
    const rows = await this.prisma.legalEntity.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        denomination: { isActive: true, deletedAt: null },
        // A country the platform turned off is not offered.
        country: { isActive: true },
      },
      orderBy: [{ denomination: { name: 'asc' } }, { legalName: 'asc' }],
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        taxId: true,
        denominationId: true,
        countryId: true,
        denomination: { select: { name: true } },
        country: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      legalName: row.legalName,
      tradeName: row.tradeName,
      taxId: row.taxId,
      denominationId: row.denominationId,
      denominationName: row.denomination.name,
      countryId: row.countryId,
      countryName: row.country.name,
    }));
  }

  async findOpenCongregation(id: number): Promise<CongregationTarget | null> {
    return this.prisma.congregation.findFirst({
      where: {
        id,
        isActive: true,
        acceptsApplications: true,
        deletedAt: null,
        denomination: { isActive: true, deletedAt: null },
      },
      select: { id: true, denominationId: true },
    });
  }

  async findCurrentPolicy(
    denominationId: number,
    today: string,
  ): Promise<CurrentPolicyRecord | null> {
    const policy = await this.prisma.privacyPolicy.findFirst({
      where: {
        denominationId,
        status: 'PUBLISHED',
        effectiveFrom: { lte: parseIsoDate(today) },
        denomination: { isActive: true, deletedAt: null },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        denominationId: true,
        version: true,
        content: true,
        effectiveFrom: true,
      },
    });
    return policy
      ? { ...policy, effectiveFrom: toIsoDate(policy.effectiveFrom) }
      : null;
  }

  async documentTypeExists(code: string): Promise<boolean> {
    return (
      (await this.prisma.documentType.count({
        where: { code, NOT: { code: 'UNKNOWN' } },
      })) > 0
    );
  }

  async maritalStatusExists(code: string): Promise<boolean> {
    return (await this.prisma.maritalStatus.count({ where: { code } })) > 0;
  }

  async educationLevelExists(code: string): Promise<boolean> {
    return (await this.prisma.educationLevel.count({ where: { code } })) > 0;
  }

  async municipalityExists(code: string): Promise<boolean> {
    return (
      (await this.prisma.municipality.count({
        where: {
          code,
          region: { country: { isoAlpha2: this.defaultCountryIso } },
        },
      })) > 0
    );
  }
}
