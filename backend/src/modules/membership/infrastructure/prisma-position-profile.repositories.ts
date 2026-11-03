import { Injectable } from '@nestjs/common';
import {
  parseIsoDate,
  toIsoDateOrNull,
  toIsoDateTime,
} from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  CatalogItem,
  MemberPositionRow,
  SocioeconomicProfileData,
  SocioeconomicProfileView,
} from '../application/member.models.js';
import type {
  PositionRepository,
  SocioeconomicRepository,
} from '../application/ports/member-details.repositories.js';

const positionInclude = {
  position: { select: { name: true } },
} satisfies Prisma.MemberPositionInclude;

type PositionPayload = Prisma.MemberPositionGetPayload<{
  include: typeof positionInclude;
}>;

function toPositionRow(row: PositionPayload): MemberPositionRow {
  return {
    id: row.id,
    memberId: row.memberId,
    positionId: row.positionId,
    positionName: row.position.name,
    startedOn: toIsoDateOrNull(row.startedOn),
    endedOn: toIsoDateOrNull(row.endedOn),
  };
}

@Injectable()
export class PrismaPositionRepository implements PositionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async positionsOf(
    scope: TenantScope,
    memberId: number,
  ): Promise<MemberPositionRow[]> {
    const rows = await this.prisma.memberPosition.findMany({
      where: { memberId, denominationId: scope.denominationId },
      include: positionInclude,
      orderBy: [{ startedOn: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toPositionRow);
  }

  async openPositionsOf(
    scope: TenantScope,
    memberId: number,
    transaction?: Transaction,
  ): Promise<MemberPositionRow[]> {
    const rows = await clientOf(
      this.prisma,
      transaction,
    ).memberPosition.findMany({
      where: { memberId, denominationId: scope.denominationId, endedOn: null },
      include: positionInclude,
    });
    return rows.map(toPositionRow);
  }

  async findRow(
    scope: TenantScope,
    memberId: number,
    memberPositionId: number,
  ): Promise<MemberPositionRow | null> {
    const row = await this.prisma.memberPosition.findFirst({
      where: {
        id: memberPositionId,
        memberId,
        denominationId: scope.denominationId,
      },
      include: positionInclude,
    });
    return row ? toPositionRow(row) : null;
  }

  positionCatalog(scope: TenantScope): Promise<CatalogItem[]> {
    return this.prisma.churchPosition.findMany({
      where: { denominationId: scope.denominationId },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  rankCatalog(scope: TenantScope): Promise<CatalogItem[]> {
    return this.prisma.pastoralRank.findMany({
      where: { denominationId: scope.denominationId },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async add(
    scope: TenantScope,
    memberId: number,
    positionId: number,
    startedOn: string,
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(
      this.prisma,
      transaction,
    ).memberPosition.create({
      data: {
        denominationId: scope.denominationId,
        memberId,
        positionId,
        startedOn: parseIsoDate(startedOn),
      },
      select: { id: true },
    });
    return created.id;
  }

  async close(
    scope: TenantScope,
    memberPositionId: number,
    endedOn: string,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).memberPosition.updateMany({
      where: { id: memberPositionId, denominationId: scope.denominationId },
      data: { endedOn: parseIsoDate(endedOn) },
    });
  }
}

function toProfileView(
  row: {
    personId: number;
    updatedAt: Date;
  } & SocioeconomicProfileData,
): SocioeconomicProfileView {
  return {
    personId: row.personId,
    hasHealthCoverage: row.hasHealthCoverage,
    hasPension: row.hasPension,
    hasOccupationalRiskCoverage: row.hasOccupationalRiskCoverage,
    isSubsidizedRegime: row.isSubsidizedRegime,
    hasFamilyCompensation: row.hasFamilyCompensation,
    sisbenLevel: row.sisbenLevel,
    isDisplaced: row.isDisplaced,
    updatedAt: toIsoDateTime(row.updatedAt),
  };
}

@Injectable()
export class PrismaSocioeconomicRepository implements SocioeconomicRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    scope: TenantScope,
    personId: number,
  ): Promise<SocioeconomicProfileView | null> {
    const row = await this.prisma.socioeconomicProfile.findFirst({
      where: { personId, denominationId: scope.denominationId },
    });
    return row ? toProfileView(row) : null;
  }

  async save(
    scope: TenantScope,
    personId: number,
    data: SocioeconomicProfileData,
    transaction: Transaction,
  ): Promise<SocioeconomicProfileView> {
    const row = await clientOf(
      this.prisma,
      transaction,
    ).socioeconomicProfile.upsert({
      where: {
        denominationId_personId: {
          denominationId: scope.denominationId,
          personId,
        },
      },
      create: { denominationId: scope.denominationId, personId, ...data },
      update: { ...data },
    });
    return toProfileView(row);
  }
}
