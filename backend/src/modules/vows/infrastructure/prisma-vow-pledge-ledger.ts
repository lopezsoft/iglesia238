import { Injectable } from '@nestjs/common';
import {
  decimalToNumber,
  toIsoDate,
  toIsoDateOrNull,
} from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  type VowPledgeStatus,
  vowPledgeStatusFor,
} from '../domain/vow-pledge-rules.js';

/** A pledge locked for the rest of the transaction, with what has been paid at that moment. */
export interface LockedLedgerPledge {
  id: number;
  congregationId: number;
  personId: number;
  contributionTypeId: number;
  pledgedAmount: number;
  pledgedOn: string;
  dueOn: string | null;
  status: VowPledgeStatus;
  /** Sum of the contributions that are not voided. */
  paid: number;
}

/**
 * The part of the pledge ledger that Aportes and Votos share: lock a pledge, add up its valid
 * payments and keep its stored status in step with them. It is the only place that decides both,
 * so recording and voiding a payment cannot disagree with creating or editing a pledge.
 */
@Injectable()
export class PrismaVowPledgeLedger {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Locks the pledge row (`SELECT ... FOR UPDATE`) so two payments to the same pledge queue up
   * and the second one sees the balance left by the first. Null when the denomination has no such pledge.
   */
  async lock(
    denominationId: number,
    pledgeId: number,
    transaction: Transaction,
  ): Promise<LockedLedgerPledge | null> {
    const client = clientOf(this.prisma, transaction);
    const locked = await client.$queryRaw<{ id: number }[]>`
      SELECT id FROM vow_pledges
      WHERE id = ${pledgeId} AND denomination_id = ${denominationId}
      FOR UPDATE`;
    if (locked.length === 0) {
      return null;
    }
    const pledge = await client.vowPledge.findFirst({
      where: { id: pledgeId, denominationId },
      select: {
        id: true,
        congregationId: true,
        personId: true,
        contributionTypeId: true,
        pledgedAmount: true,
        pledgedOn: true,
        dueOn: true,
        status: true,
      },
    });
    if (!pledge) {
      return null;
    }
    return {
      id: pledge.id,
      congregationId: pledge.congregationId,
      personId: pledge.personId,
      contributionTypeId: pledge.contributionTypeId,
      pledgedAmount: decimalToNumber(pledge.pledgedAmount),
      pledgedOn: toIsoDate(pledge.pledgedOn),
      dueOn: toIsoDateOrNull(pledge.dueOn),
      status: pledge.status,
      paid: await this.paidOf(denominationId, pledgeId, transaction),
    };
  }

  async paidOf(
    denominationId: number,
    pledgeId: number,
    transaction: Transaction,
  ): Promise<number> {
    const sum = await clientOf(this.prisma, transaction).contribution.aggregate(
      {
        where: { denominationId, vowPledgeId: pledgeId, status: 'RECORDED' },
        _sum: { amount: true },
      },
    );
    return sum._sum.amount ? decimalToNumber(sum._sum.amount) : 0;
  }

  /** Stores the status the payments imply; a cancelled pledge stays cancelled. */
  async refreshStatus(
    denominationId: number,
    pledgeId: number,
    transaction: Transaction,
  ): Promise<VowPledgeStatus> {
    const client = clientOf(this.prisma, transaction);
    const pledge = await client.vowPledge.findFirst({
      where: { id: pledgeId, denominationId },
      select: { pledgedAmount: true, status: true },
    });
    if (!pledge) {
      throw new Error('Pledge not found while refreshing its status');
    }
    const paid = await this.paidOf(denominationId, pledgeId, transaction);
    const status = vowPledgeStatusFor(
      pledge.status,
      decimalToNumber(pledge.pledgedAmount),
      paid,
    );
    if (status !== pledge.status) {
      await client.vowPledge.update({
        where: { id: pledgeId },
        data: { status },
      });
    }
    return status;
  }
}
