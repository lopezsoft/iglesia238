import { Injectable } from '@nestjs/common';
import {
  decimalToNumber,
  parseIsoDate,
  toIsoDate,
} from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  TitheRuleReader,
  TitheRuleRecord,
} from '../application/tithe-settlement.ports.js';

/** Read side of the tithe percentages. They are written in the accounting setup. */
@Injectable()
export class PrismaTitheRuleReader implements TitheRuleReader {
  constructor(private readonly prisma: PrismaService) {}

  async findInForce(
    denominationId: number,
    date: string,
    transaction?: Transaction,
  ): Promise<TitheRuleRecord | null> {
    const row = await clientOf(
      this.prisma,
      transaction,
    ).titheSettlementRule.findFirst({
      where: { denominationId, effectiveFrom: { lte: parseIsoDate(date) } },
      orderBy: { effectiveFrom: 'desc' },
      select: {
        id: true,
        effectiveFrom: true,
        nationalShareRate: true,
        localFundRate: true,
      },
    });
    return row
      ? {
          id: row.id,
          effectiveFrom: toIsoDate(row.effectiveFrom),
          nationalShareRate: decimalToNumber(row.nationalShareRate),
          localFundRate: decimalToNumber(row.localFundRate),
        }
      : null;
  }
}
