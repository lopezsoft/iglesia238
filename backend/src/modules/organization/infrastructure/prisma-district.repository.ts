import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { compareSpanish } from '../../../common/text/comparable-text.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  DistrictData,
  DistrictRecord,
  DistrictRepository,
} from '../application/organization.ports.js';

const WITH_CONGREGATIONS = {
  congregations: {
    where: { deletedAt: null },
    select: { name: true },
  },
} satisfies Prisma.DistrictInclude;

type DistrictRow = Prisma.DistrictGetPayload<{
  include: typeof WITH_CONGREGATIONS;
}>;

function toRecord(row: DistrictRow): DistrictRecord {
  return {
    id: row.id,
    denominationId: row.denominationId,
    number: row.number,
    name: row.name,
    congregationNames: row.congregations
      .map((congregation) => congregation.name)
      .sort((a, b) => compareSpanish(a, b)),
  };
}

@Injectable()
export class PrismaDistrictRepository
  extends TenantScopedRepository
  implements DistrictRepository
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(scope: TenantScope): Promise<DistrictRecord[]> {
    const rows = await this.prisma.district.findMany({
      where: { denominationId: scope.denominationId },
      include: WITH_CONGREGATIONS,
    });
    return rows.map(toRecord);
  }

  async findById(
    scope: TenantScope,
    id: number,
  ): Promise<DistrictRecord | null> {
    const row = await this.prisma.district.findFirst({
      where: { id, denominationId: scope.denominationId },
      include: WITH_CONGREGATIONS,
    });
    return row ? toRecord(row) : null;
  }

  async create(
    scope: TenantScope,
    data: DistrictData,
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(this.prisma, transaction).district.create({
      data: { denominationId: scope.denominationId, ...data },
      select: { id: true },
    });
    return created.id;
  }

  async update(
    scope: TenantScope,
    id: number,
    data: DistrictData,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).district.updateMany({
      where: { id, denominationId: scope.denominationId },
      data,
    });
  }
}
