import { Injectable } from '@nestjs/common';
import { comparableText } from '../../../common/text/comparable-text.js';
import {
  decimalToNumber,
  decimalToNumberOrNull,
  parseIsoDate,
  toIsoDate,
} from '../../../common/mappers/value-mappers.js';
import {
  formatMemberCode,
  formatVoucherCode,
  SequenceKeys,
} from '../../../common/numbering/document-numbering.service.js';
import { buildPage, toSkipTake } from '../../../common/pagination/page.js';
import type { Page } from '../../../common/pagination/page.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { TITHE_SETTLEMENT_LEDGER } from '../application/tithe-settlement.config.js';
import type {
  BookingTarget,
  BookingTargets,
  SettlementCashLine,
  SettlementDetailData,
  SettlementListQuery,
  SettlementRecord,
  TitheContributionData,
  TitheRangeView,
  TitheYearSummary,
} from '../application/tithe-settlement.models.js';
import type {
  CongregationInfo,
  PeriodRecord,
  TitheSettlementReader,
} from '../application/tithe-settlement.ports.js';
import {
  personDisplayName,
  SETTLEMENT_SELECT,
  toSettlementRecord,
} from './settlement-records.js';

const TITHE_SELECT = {
  id: true,
  receivedOn: true,
  amount: true,
  status: true,
  titheSettlementId: true,
  personId: true,
  paymentMethod: true,
  voucher: { select: { type: true, number: true, issuedOn: true } },
  person: {
    select: {
      fullName: true,
      firstName: true,
      lastName: true,
      secondLastName: true,
      member: {
        select: {
          memberRegistryEntries: {
            where: { endedOn: null },
            select: {
              memberNumber: true,
              congregation: { select: { code: true } },
            },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.ContributionSelect;

type TitheRow = Prisma.ContributionGetPayload<{ select: typeof TITHE_SELECT }>;

function toTitheData(row: TitheRow): TitheContributionData {
  const entry = row.person?.member?.memberRegistryEntries[0];
  return {
    id: row.id,
    receivedOn: toIsoDate(row.receivedOn),
    amount: decimalToNumber(row.amount),
    status: row.status,
    titheSettlementId: row.titheSettlementId,
    personId: row.personId,
    contributorName: row.person ? personDisplayName(row.person) : null,
    memberCode: entry
      ? formatMemberCode(entry.congregation.code, entry.memberNumber)
      : null,
    paymentMethod: row.paymentMethod,
    receiptNumber: row.voucher
      ? formatVoucherCode(
          row.voucher.type,
          row.voucher.issuedOn,
          row.voucher.number,
        )
      : null,
  };
}

@Injectable()
export class PrismaTitheSettlementReader
  extends TenantScopedRepository
  implements TitheSettlementReader
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findCongregation(scope: TenantScope): Promise<CongregationInfo | null> {
    const row = await this.prisma.congregation.findFirst({
      where: {
        id: scope.requireCongregationId(),
        denominationId: scope.denominationId,
      },
      select: { name: true, denomination: { select: { name: true } } },
    });
    return row
      ? { name: row.name, denominationName: row.denomination.name }
      : null;
  }

  async findTithesInRange(
    scope: TenantScope,
    range: TitheRangeView,
    transaction?: Transaction,
  ): Promise<TitheContributionData[]> {
    const rows = await clientOf(this.prisma, transaction).contribution.findMany(
      {
        where: this.scoped(scope, {
          contributionType: { category: 'TITHE' as const },
          receivedOn: {
            gte: parseIsoDate(range.from),
            lte: parseIsoDate(range.to),
          },
        }),
        orderBy: [{ receivedOn: 'asc' }, { id: 'asc' }],
        select: TITHE_SELECT,
      },
    );
    return rows.map(toTitheData);
  }

  async findOverlapping(
    scope: TenantScope,
    range: TitheRangeView,
    transaction?: Transaction,
  ): Promise<SettlementRecord | null> {
    const row = await clientOf(
      this.prisma,
      transaction,
    ).titheSettlement.findFirst({
      where: this.scoped(scope, {
        status: 'ISSUED' as const,
        coveredFrom: { lte: parseIsoDate(range.to) },
        coveredTo: { gte: parseIsoDate(range.from) },
      }),
      orderBy: { coveredTo: 'desc' },
      select: SETTLEMENT_SELECT,
    });
    return row ? toSettlementRecord(row) : null;
  }

  async findLastIssuedRange(
    scope: TenantScope,
  ): Promise<TitheRangeView | null> {
    const row = await this.prisma.titheSettlement.findFirst({
      where: this.scoped(scope, { status: 'ISSUED' as const }),
      orderBy: [{ coveredTo: 'desc' }, { id: 'desc' }],
      select: { coveredFrom: true, coveredTo: true },
    });
    return row
      ? { from: toIsoDate(row.coveredFrom), to: toIsoDate(row.coveredTo) }
      : null;
  }

  async summarizeYear(
    scope: TenantScope,
    year: number,
  ): Promise<TitheYearSummary> {
    const sums = await this.prisma.titheSettlement.aggregate({
      where: this.scoped(scope, {
        status: 'ISSUED' as const,
        settledOn: {
          gte: parseIsoDate(`${year}-01-01`),
          lte: parseIsoDate(`${year}-12-31`),
        },
      }),
      _count: { _all: true },
      _sum: {
        grossTithe: true,
        nationalShare: true,
        localFundShare: true,
        pastorNet: true,
      },
    });
    return {
      year,
      issuedCount: sums._count._all,
      grossTithe: decimalToNumberOrNull(sums._sum.grossTithe) ?? 0,
      nationalShare: decimalToNumberOrNull(sums._sum.nationalShare) ?? 0,
      localFundShare: decimalToNumberOrNull(sums._sum.localFundShare) ?? 0,
      pastorNet: decimalToNumberOrNull(sums._sum.pastorNet) ?? 0,
    };
  }

  async list(
    scope: TenantScope,
    query: SettlementListQuery,
  ): Promise<Page<SettlementRecord>> {
    const settledOn: Prisma.DateTimeFilter = {};
    if (query.from) {
      settledOn.gte = parseIsoDate(query.from);
    }
    if (query.to) {
      settledOn.lte = parseIsoDate(query.to);
    }
    const where = this.scoped(scope, {
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to ? { settledOn } : {}),
    });
    const [total, rows] = await Promise.all([
      this.prisma.titheSettlement.count({ where }),
      this.prisma.titheSettlement.findMany({
        where,
        orderBy: [{ settledOn: 'desc' }, { id: 'desc' }],
        select: SETTLEMENT_SELECT,
        ...toSkipTake(query),
      }),
    ]);
    return buildPage(rows.map(toSettlementRecord), total, query);
  }

  async findById(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<SettlementRecord | null> {
    const row = await clientOf(
      this.prisma,
      transaction,
    ).titheSettlement.findFirst({
      where: this.scoped(scope, { id }),
      select: SETTLEMENT_SELECT,
    });
    return row ? toSettlementRecord(row) : null;
  }

  async findDetail(
    scope: TenantScope,
    id: number,
  ): Promise<SettlementDetailData | null> {
    const row = await this.prisma.titheSettlement.findFirst({
      where: this.scoped(scope, { id }),
      select: {
        ...SETTLEMENT_SELECT,
        voucherId: true,
        congregation: { select: { name: true } },
        voidedBy: { select: { displayName: true } },
      },
    });
    if (!row) {
      return null;
    }
    const [tithes, cash] = await Promise.all([
      this.prisma.contribution.findMany({
        where: this.scoped(scope, { titheSettlementId: id }),
        orderBy: [{ receivedOn: 'asc' }, { id: 'asc' }],
        select: TITHE_SELECT,
      }),
      row.voucherId === null
        ? Promise.resolve([])
        : this.prisma.cashTransaction.findMany({
            where: this.scoped(scope, { voucherId: row.voucherId }),
            orderBy: { id: 'asc' },
            select: {
              id: true,
              postedOn: true,
              direction: true,
              amount: true,
              description: true,
              reversalOfId: true,
              account: { select: { code: true, name: true } },
              fund: { select: { name: true } },
            },
          }),
    ]);
    const cashLines: SettlementCashLine[] = cash.map((line) => ({
      id: line.id,
      postedOn: toIsoDate(line.postedOn),
      direction: line.direction,
      amount: decimalToNumber(line.amount),
      description: line.description,
      accountCode: line.account.code,
      accountName: line.account.name,
      fundName: line.fund.name,
      isReversal: line.reversalOfId !== null,
    }));
    return {
      record: toSettlementRecord(row),
      congregationName: row.congregation.name,
      voidedByName: row.voidedBy?.displayName ?? null,
      contributions: tithes.map(toTitheData),
      cashLines,
    };
  }

  async peekNextVoucherNumber(scope: TenantScope): Promise<number> {
    const row = await this.prisma.documentSequence.findUnique({
      where: {
        congregationId_key: {
          congregationId: scope.requireCongregationId(),
          key: SequenceKeys.voucher(TITHE_SETTLEMENT_LEDGER.voucherType),
        },
      },
      select: { lastValue: true },
    });
    return (row?.lastValue ?? 0) + 1;
  }

  async findBookingTargets(
    scope: TenantScope,
    transaction?: Transaction,
  ): Promise<BookingTargets> {
    const client = clientOf(this.prisma, transaction);
    const { payableAccountCodes, localFundName } = TITHE_SETTLEMENT_LEDGER;
    const [accounts, funds] = await Promise.all([
      client.account.findMany({
        where: {
          denominationId: scope.denominationId,
          code: {
            in: [
              payableAccountCodes.nationalShare,
              payableAccountCodes.pastorNet,
            ],
          },
          nature: 'EXPENSE',
          isPostable: true,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
          defaultFund: { select: { id: true, name: true, isActive: true } },
        },
      }),
      client.fund.findMany({
        where: { denominationId: scope.denominationId },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, isActive: true },
      }),
    ]);

    const localFund =
      funds.find(
        (fund) =>
          fund.isActive &&
          comparableText(fund.name) === comparableText(localFundName),
      ) ??
      funds.find((fund) => fund.isActive) ??
      null;

    const targetOf = (code: string): BookingTarget | null => {
      const account = accounts.find((candidate) => candidate.code === code);
      const fund = account?.defaultFund ?? localFund;
      if (!account || !fund) {
        return null;
      }
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        fundId: fund.id,
        fundName: fund.name,
        fundIsActive: fund.isActive,
      };
    };

    return {
      nationalShare: targetOf(payableAccountCodes.nationalShare),
      pastorNet: targetOf(payableAccountCodes.pastorNet),
      localFundName: localFund?.name ?? null,
    };
  }

  async findPeriod(
    scope: TenantScope,
    year: number,
    month: number,
    transaction?: Transaction,
  ): Promise<PeriodRecord | null> {
    const row = await clientOf(
      this.prisma,
      transaction,
    ).accountingPeriod.findFirst({
      where: this.scoped(scope, { year, month }),
      select: { id: true, status: true },
    });
    return row ? { id: row.id, status: row.status } : null;
  }
}
