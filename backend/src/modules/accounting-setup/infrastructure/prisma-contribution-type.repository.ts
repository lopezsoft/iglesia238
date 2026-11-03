import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  ContributionTypeData,
  ContributionTypeRecord,
  ContributionTypeRepository,
} from '../application/contribution-type.repository.js';

const INCLUDE = {
  account: { select: { code: true, name: true } },
  _count: { select: { contributions: true } },
} as const;

function toRecord(row: {
  id: number;
  denominationId: number;
  category: ContributionTypeRecord['category'];
  code: string;
  name: string;
  accountId: number;
  isActive: boolean;
  account: { code: string; name: string };
  _count: { contributions: number };
}): ContributionTypeRecord {
  return {
    id: row.id,
    denominationId: row.denominationId,
    category: row.category,
    code: row.code,
    name: row.name,
    accountId: row.accountId,
    isActive: row.isActive,
    accountCode: row.account.code,
    accountName: row.account.name,
    contributionCount: row._count.contributions,
  };
}

@Injectable()
export class PrismaContributionTypeRepository implements ContributionTypeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: TenantScope): Promise<ContributionTypeRecord[]> {
    const rows = await this.prisma.contributionType.findMany({
      where: { denominationId: scope.denominationId },
      include: INCLUDE,
      orderBy: { id: 'asc' },
    });
    return rows.map(toRecord);
  }

  async find(
    scope: TenantScope,
    id: number,
  ): Promise<ContributionTypeRecord | null> {
    const row = await this.prisma.contributionType.findFirst({
      where: { id, denominationId: scope.denominationId },
      include: INCLUDE,
    });
    return row ? toRecord(row) : null;
  }

  async create(
    scope: TenantScope,
    data: ContributionTypeData,
    transaction: Transaction,
  ): Promise<number> {
    const row = await clientOf(
      this.prisma,
      transaction,
    ).contributionType.create({
      data: { denominationId: scope.denominationId, ...data },
      select: { id: true },
    });
    return row.id;
  }

  async update(
    scope: TenantScope,
    id: number,
    data: ContributionTypeData,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).contributionType.update({
      where: {
        denominationId_id: { denominationId: scope.denominationId, id },
      },
      data,
    });
  }

  async setActive(
    scope: TenantScope,
    id: number,
    isActive: boolean,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).contributionType.update({
      where: {
        denominationId_id: { denominationId: scope.denominationId, id },
      },
      data: { isActive },
    });
  }
}
