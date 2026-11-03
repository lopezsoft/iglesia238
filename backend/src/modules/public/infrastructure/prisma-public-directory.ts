import { Injectable } from '@nestjs/common';
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
} from '../application/ports/public-directory.reader.js';

@Injectable()
export class PrismaPublicDirectory implements PublicDirectory {
  constructor(private readonly prisma: PrismaService) {}

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
            region: { select: { name: true } },
          },
        },
        neighborhood: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      denominationId: row.denominationId,
      denominationName: row.denomination.name,
      name: row.name,
      municipalityCode: row.municipality?.code ?? null,
      municipalityName: row.municipality?.name ?? null,
      regionName: row.municipality?.region.name ?? null,
      neighborhood: row.neighborhood?.name ?? null,
      address: row.address,
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

  async municipalityExists(code: string): Promise<boolean> {
    return (await this.prisma.municipality.count({ where: { code } })) > 0;
  }
}
