import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  AccountData,
  AccountFacts,
  AccountRecord,
  AccountRepository,
} from '../application/account.repository.js';

const SELECT = {
  id: true,
  denominationId: true,
  defaultFundId: true,
  parentId: true,
  code: true,
  legacyCode: true,
  name: true,
  nature: true,
  isPostable: true,
  isActive: true,
};

/** The chart of accounts belongs to the denomination. */
@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(scope: TenantScope): Promise<AccountRecord[]> {
    return this.prisma.account.findMany({
      where: { denominationId: scope.denominationId },
      select: SELECT,
      orderBy: { code: 'asc' },
    });
  }

  find(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<AccountRecord | null> {
    return clientOf(this.prisma, transaction).account.findFirst({
      where: { id, denominationId: scope.denominationId },
      select: SELECT,
    });
  }

  async facts(scope: TenantScope): Promise<ReadonlyMap<number, AccountFacts>> {
    const { denominationId } = scope;
    const [cash, budget, types] = await Promise.all([
      this.prisma.cashTransaction.groupBy({
        by: ['accountId'],
        where: { denominationId },
        _count: { _all: true },
      }),
      this.prisma.budgetLine.groupBy({
        by: ['accountId'],
        where: { denominationId },
        _count: { _all: true },
      }),
      this.prisma.contributionType.findMany({
        where: { denominationId },
        select: { accountId: true, isActive: true },
      }),
    ]);

    const facts = new Map<number, AccountFacts>();
    const of = (id: number): AccountFacts =>
      facts.get(id) ?? {
        hasMovements: false,
        linkedTypes: 0,
        activeLinkedTypes: 0,
      };
    for (const row of [...cash, ...budget]) {
      facts.set(row.accountId, { ...of(row.accountId), hasMovements: true });
    }
    for (const type of types) {
      const current = of(type.accountId);
      facts.set(type.accountId, {
        ...current,
        linkedTypes: current.linkedTypes + 1,
        activeLinkedTypes: current.activeLinkedTypes + (type.isActive ? 1 : 0),
      });
    }
    return facts;
  }

  create(
    scope: TenantScope,
    data: AccountData,
    transaction: Transaction,
  ): Promise<AccountRecord> {
    return clientOf(this.prisma, transaction).account.create({
      data: { denominationId: scope.denominationId, ...data },
      select: SELECT,
    });
  }

  update(
    scope: TenantScope,
    id: number,
    data: Partial<
      Pick<
        AccountRecord,
        'code' | 'name' | 'isPostable' | 'defaultFundId' | 'isActive'
      >
    >,
    transaction: Transaction,
  ): Promise<AccountRecord> {
    return clientOf(this.prisma, transaction).account.update({
      where: {
        denominationId_id: { denominationId: scope.denominationId, id },
      },
      data,
      select: SELECT,
    });
  }

  async delete(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).account.delete({
      where: {
        denominationId_id: { denominationId: scope.denominationId, id },
      },
    });
  }
}
