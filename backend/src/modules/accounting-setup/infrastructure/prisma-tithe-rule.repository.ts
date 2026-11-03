import { Injectable } from '@nestjs/common';
import {
  decimalToNumber,
  parseIsoDate,
  toIsoDate,
} from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  TitheRuleData,
  TitheRuleRecord,
  TitheRuleRepository,
} from '../application/tithe-rule.repository.js';

interface Row {
  id: number;
  denominationId: number;
  effectiveFrom: Date;
  nationalShareRate: { toNumber(): number };
  localFundRate: { toNumber(): number };
}

function toRecord(row: Row): TitheRuleRecord {
  return {
    id: row.id,
    denominationId: row.denominationId,
    effectiveFrom: toIsoDate(row.effectiveFrom),
    nationalShareRate: decimalToNumber(row.nationalShareRate),
    localFundRate: decimalToNumber(row.localFundRate),
  };
}

@Injectable()
export class PrismaTitheRuleRepository implements TitheRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: TenantScope): Promise<TitheRuleRecord[]> {
    const rows = await this.prisma.titheSettlementRule.findMany({
      where: { denominationId: scope.denominationId },
      orderBy: { effectiveFrom: 'desc' },
    });
    return rows.map(toRecord);
  }

  async find(scope: TenantScope, id: number): Promise<TitheRuleRecord | null> {
    const row = await this.prisma.titheSettlementRule.findFirst({
      where: { id, denominationId: scope.denominationId },
    });
    return row ? toRecord(row) : null;
  }

  async create(
    scope: TenantScope,
    data: TitheRuleData,
    transaction: Transaction,
  ): Promise<TitheRuleRecord> {
    const row = await clientOf(
      this.prisma,
      transaction,
    ).titheSettlementRule.create({
      data: {
        denominationId: scope.denominationId,
        effectiveFrom: parseIsoDate(data.effectiveFrom),
        nationalShareRate: data.nationalShareRate,
        localFundRate: data.localFundRate,
      },
    });
    return toRecord(row);
  }

  async update(
    scope: TenantScope,
    id: number,
    data: TitheRuleData,
    transaction: Transaction,
  ): Promise<TitheRuleRecord> {
    // updateMany keeps the denomination in the filter; the row is read back right after.
    const client = clientOf(this.prisma, transaction);
    await client.titheSettlementRule.updateMany({
      where: { id, denominationId: scope.denominationId },
      data: {
        effectiveFrom: parseIsoDate(data.effectiveFrom),
        nationalShareRate: data.nationalShareRate,
        localFundRate: data.localFundRate,
      },
    });
    const row = await client.titheSettlementRule.findFirstOrThrow({
      where: { id, denominationId: scope.denominationId },
    });
    return toRecord(row);
  }

  async delete(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).titheSettlementRule.deleteMany({
      where: { id, denominationId: scope.denominationId },
    });
  }

  countIssuedSettlements(
    scope: TenantScope,
    from: string,
    toExclusive: string | null,
  ): Promise<number> {
    return this.prisma.titheSettlement.count({
      where: {
        denominationId: scope.denominationId,
        status: 'ISSUED',
        settledOn: {
          gte: parseIsoDate(from),
          ...(toExclusive === null ? {} : { lt: parseIsoDate(toExclusive) }),
        },
      },
    });
  }
}
