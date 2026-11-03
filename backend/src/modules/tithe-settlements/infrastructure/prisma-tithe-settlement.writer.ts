import { Injectable } from '@nestjs/common';
import { ConflictDomainException } from '../../../common/errors/domain.exception.js';
import { parseIsoDate } from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  NewSettlement,
  SettlementRecord,
  VoidOutcome,
  VoidSettlementInput,
} from '../application/tithe-settlement.models.js';
import type { TitheSettlementWriter } from '../application/tithe-settlement.ports.js';
import { SETTLEMENT_SELECT, toSettlementRecord } from './settlement-records.js';

@Injectable()
export class PrismaTitheSettlementWriter
  extends TenantScopedRepository
  implements TitheSettlementWriter
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    scope: TenantScope,
    input: NewSettlement,
    transaction: Transaction,
  ): Promise<SettlementRecord> {
    const client = clientOf(this.prisma, transaction);
    const congregationId = scope.requireCongregationId();
    const { denominationId } = scope;
    const settledOn = parseIsoDate(input.settledOn);

    const voucher = await client.voucher.create({
      data: {
        denominationId,
        congregationId,
        type: input.voucherType,
        number: input.voucherNumber,
        issuedOn: settledOn,
      },
      select: { id: true },
    });
    const settlement = await client.titheSettlement.create({
      data: {
        denominationId,
        congregationId,
        voucherId: voucher.id,
        settledOn,
        coveredFrom: parseIsoDate(input.coveredFrom),
        coveredTo: parseIsoDate(input.coveredTo),
        grossTithe: input.grossTithe,
        nationalShareRate: input.nationalShareRate,
        localFundRate: input.localFundRate,
        nationalShare: input.nationalShare,
        localFundShare: input.localFundShare,
        pastorNet: input.pastorNet,
        status: 'ISSUED',
      },
      select: { id: true },
    });

    // The tithes may have been voided or settled by someone else since the draft was read.
    const linked = await client.contribution.updateMany({
      where: this.scoped(scope, {
        id: { in: [...input.contributionIds] },
        status: 'RECORDED' as const,
        titheSettlementId: null,
      }),
      data: { titheSettlementId: settlement.id },
    });
    if (linked.count !== input.contributionIds.length) {
      throw new ConflictDomainException(
        'Los diezmos del rango cambiaron mientras confirmabas. Vuelve a calcular la liquidación.',
        'TITHES_CHANGED',
      );
    }

    for (const line of input.cashLines) {
      await client.cashTransaction.create({
        data: {
          denominationId,
          congregationId,
          periodId: input.periodId,
          accountId: line.accountId,
          fundId: line.fundId,
          voucherId: voucher.id,
          direction: 'OUT',
          postedOn: settledOn,
          amount: line.amount,
          description: line.description,
          createdById: input.userId,
        },
      });
    }

    const row = await client.titheSettlement.findFirstOrThrow({
      where: this.scoped(scope, { id: settlement.id }),
      select: SETTLEMENT_SELECT,
    });
    return toSettlementRecord(row);
  }

  async void(
    scope: TenantScope,
    id: number,
    input: VoidSettlementInput,
    transaction: Transaction,
  ): Promise<VoidOutcome | null> {
    const client = clientOf(this.prisma, transaction);
    const congregationId = scope.requireCongregationId();
    const { denominationId } = scope;
    const now = new Date();

    // Only an issued settlement of the sede changes; the count tells if someone was faster.
    const marked = await client.titheSettlement.updateMany({
      where: this.scoped(scope, { id, status: 'ISSUED' as const }),
      data: {
        status: 'VOIDED',
        voidedById: input.userId,
        voidedAt: now,
        voidReason: input.reason,
      },
    });
    if (marked.count === 0) {
      return null;
    }

    const settlement = await client.titheSettlement.findFirstOrThrow({
      where: this.scoped(scope, { id }),
      select: { voucherId: true },
    });

    let reversedCount = 0;
    if (settlement.voucherId !== null) {
      const lines = await client.cashTransaction.findMany({
        where: this.scoped(scope, {
          voucherId: settlement.voucherId,
          reversalOfId: null,
          reversedBy: null,
        }),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          accountId: true,
          fundId: true,
          direction: true,
          amount: true,
        },
      });
      for (const line of lines) {
        await client.cashTransaction.create({
          data: {
            denominationId,
            congregationId,
            periodId: input.periodId,
            accountId: line.accountId,
            fundId: line.fundId,
            voucherId: settlement.voucherId,
            direction: line.direction === 'IN' ? 'OUT' : 'IN',
            postedOn: parseIsoDate(input.today),
            amount: line.amount,
            description: input.reversalDescription,
            reversalOfId: line.id,
            createdById: input.userId,
          },
        });
        reversedCount += 1;
      }
      await client.voucher.updateMany({
        where: this.scoped(scope, { id: settlement.voucherId }),
        data: { voidedAt: now, voidReason: input.reason },
      });
    }

    const released = await client.contribution.updateMany({
      where: this.scoped(scope, { titheSettlementId: id }),
      data: { titheSettlementId: null },
    });

    const row = await client.titheSettlement.findFirstOrThrow({
      where: this.scoped(scope, { id }),
      select: SETTLEMENT_SELECT,
    });
    return {
      record: toSettlementRecord(row),
      releasedCount: released.count,
      reversedCount,
    };
  }
}
