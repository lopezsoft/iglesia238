import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  CongregationData,
  CongregationRecord,
  CongregationRepository,
} from '../application/organization.ports.js';

const WITH_RELATIONS = {
  legalEntity: { select: { legalName: true } },
  district: { select: { number: true } },
  municipality: {
    select: {
      code: true,
      name: true,
      region: { select: { code: true, name: true } },
    },
  },
  neighborhood: { select: { name: true } },
} satisfies Prisma.CongregationInclude;

type CongregationRow = Prisma.CongregationGetPayload<{
  include: typeof WITH_RELATIONS;
}>;

function toRecord(row: CongregationRow): CongregationRecord {
  return {
    id: row.id,
    denominationId: row.denominationId,
    legalEntityId: row.legalEntityId,
    legalEntityName: row.legalEntity.legalName,
    districtId: row.districtId,
    districtNumber: row.district?.number ?? null,
    code: row.code,
    name: row.name,
    municipalityCode: row.municipality.code,
    municipalityName: row.municipality.name,
    regionCode: row.municipality.region.code,
    regionName: row.municipality.region.name,
    neighborhood: row.neighborhood?.name ?? null,
    address: row.address,
    phone: row.phone,
    email: row.email,
    acceptsApplications: row.acceptsApplications,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaCongregationRepository
  extends TenantScopedRepository
  implements CongregationRepository
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Organization lists always cover the whole denomination, whatever the session scope was. */
  private denominationWhere(scope: TenantScope, extra: object = {}) {
    return { ...extra, denominationId: scope.denominationId, deletedAt: null };
  }

  async list(scope: TenantScope): Promise<CongregationRecord[]> {
    const rows = await this.prisma.congregation.findMany({
      where: this.denominationWhere(scope),
      include: WITH_RELATIONS,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async findById(
    scope: TenantScope,
    id: number,
  ): Promise<CongregationRecord | null> {
    const row = await this.prisma.congregation.findFirst({
      where: this.denominationWhere(scope, { id }),
      include: WITH_RELATIONS,
    });
    return row ? toRecord(row) : null;
  }

  async listSelectable(scope: TenantScope): Promise<CongregationRecord[]> {
    const rows = await this.prisma.congregation.findMany({
      where: this.denominationWhere(scope, {
        isActive: true,
        ...(scope.congregationId === null ? {} : { id: scope.congregationId }),
      }),
      include: WITH_RELATIONS,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toRecord);
  }

  listIdentifiers(
    scope: TenantScope,
  ): Promise<{ id: number; name: string; code: string }[]> {
    return this.prisma.congregation.findMany({
      where: this.denominationWhere(scope),
      select: { id: true, name: true, code: true },
    });
  }

  async create(
    scope: TenantScope,
    data: CongregationData,
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(
      this.prisma,
      transaction,
    ).congregation.create({
      data: { denominationId: scope.denominationId, ...data },
      select: { id: true },
    });
    return created.id;
  }

  async update(
    scope: TenantScope,
    id: number,
    data: CongregationData,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).congregation.updateMany({
      where: this.denominationWhere(scope, { id }),
      data,
    });
  }

  async patch(
    scope: TenantScope,
    id: number,
    change: { isActive?: boolean; acceptsApplications?: boolean },
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).congregation.updateMany({
      where: this.denominationWhere(scope, { id }),
      data: change,
    });
  }
}
