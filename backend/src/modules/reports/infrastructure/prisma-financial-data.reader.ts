import { Injectable } from '@nestjs/common';
import {
  decimalToNumber,
  parseIsoDate,
  toIsoDate,
} from '../../../common/mappers/value-mappers.js';
import { formatVoucherCode } from '../../../common/numbering/document-numbering.service.js';
import { composeFullName } from '../../../common/people/full-name.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  DataFilter,
  DateSpan,
  FinancialDataReader,
} from '../application/ports/financial-data.reader.js';
import type {
  AccountData,
  CashSumRow,
  CongregationData,
  ContributionDetailData,
  ContributionTypeData,
  ContributionTypeSum,
  DailyAmount,
  FundData,
  OpeningBalanceRow,
  PendingConsolidation,
  PeriodData,
} from '../application/report.models.js';

function dates(span: DateSpan) {
  return { gte: parseIsoDate(span.from), lte: parseIsoDate(span.to) };
}

function sumOf(value: { toNumber(): number } | null): number {
  return value ? decimalToNumber(value) : 0;
}

/** Recorded contributions of the sedes in scope; the fund is the one of the cash line or the default of the account. */
function contributionWhere(
  filter: DataFilter,
  span: DateSpan,
): Prisma.ContributionWhereInput {
  return {
    denominationId: filter.denominationId,
    congregationId: { in: [...filter.congregationIds] },
    receivedOn: dates(span),
    ...(filter.fundId === null
      ? {}
      : {
          OR: [
            { cashTransaction: { fundId: filter.fundId } },
            {
              cashTransactionId: null,
              contributionType: { account: { defaultFundId: filter.fundId } },
            },
          ],
        }),
  };
}

const DETAIL_SELECT = {
  id: true,
  receivedOn: true,
  amount: true,
  paymentMethod: true,
  paymentReference: true,
  status: true,
  titheSettlementId: true,
  voucher: { select: { type: true, number: true, issuedOn: true } },
  congregation: { select: { name: true } },
  person: {
    select: {
      fullName: true,
      firstName: true,
      lastName: true,
      secondLastName: true,
    },
  },
  cashTransaction: { select: { fund: { select: { name: true } } } },
  contributionType: {
    select: {
      name: true,
      account: { select: { defaultFund: { select: { name: true } } } },
    },
  },
} satisfies Prisma.ContributionSelect;

@Injectable()
export class PrismaFinancialDataReader implements FinancialDataReader {
  constructor(private readonly prisma: PrismaService) {}

  async denominationName(denominationId: number): Promise<string | null> {
    const row = await this.prisma.denomination.findUnique({
      where: { id: denominationId },
      select: { name: true },
    });
    return row?.name ?? null;
  }

  async listCongregations(denominationId: number): Promise<CongregationData[]> {
    return await this.prisma.congregation.findMany({
      where: { denominationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isActive: true },
    });
  }

  async listFunds(denominationId: number): Promise<FundData[]> {
    return await this.prisma.fund.findMany({
      where: { denominationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isActive: true },
    });
  }

  async listAccounts(denominationId: number): Promise<AccountData[]> {
    return await this.prisma.account.findMany({
      where: { denominationId },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, nature: true },
    });
  }

  async listContributionTypes(
    denominationId: number,
  ): Promise<ContributionTypeData[]> {
    return await this.prisma.contributionType.findMany({
      where: { denominationId },
      select: { id: true, name: true, category: true, accountId: true },
    });
  }

  async sumCash(filter: DataFilter, span: DateSpan): Promise<CashSumRow[]> {
    const rows = await this.prisma.cashTransaction.groupBy({
      by: ['congregationId', 'fundId', 'accountId', 'direction'],
      where: {
        denominationId: filter.denominationId,
        congregationId: { in: [...filter.congregationIds] },
        ...(filter.fundId === null ? {} : { fundId: filter.fundId }),
        postedOn: dates(span),
      },
      _sum: { amount: true },
    });
    return rows.map((row) => ({
      congregationId: row.congregationId,
      fundId: row.fundId,
      accountId: row.accountId,
      direction: row.direction,
      amount: sumOf(row._sum.amount),
    }));
  }

  async sumOpeningBalances(
    filter: DataFilter,
    year: number,
  ): Promise<OpeningBalanceRow[]> {
    const rows = await this.prisma.fundOpeningBalance.groupBy({
      by: ['fundId'],
      where: {
        denominationId: filter.denominationId,
        congregationId: { in: [...filter.congregationIds] },
        year,
        ...(filter.fundId === null ? {} : { fundId: filter.fundId }),
      },
      _sum: { amount: true },
    });
    return rows.map((row) => ({
      fundId: row.fundId,
      amount: sumOf(row._sum.amount),
    }));
  }

  async listPeriods(filter: DataFilter, year: number): Promise<PeriodData[]> {
    return await this.prisma.accountingPeriod.findMany({
      where: {
        denominationId: filter.denominationId,
        congregationId: { in: [...filter.congregationIds] },
        year,
      },
      select: { congregationId: true, month: true, status: true },
    });
  }

  async sumContributions(
    filter: DataFilter,
    span: DateSpan,
  ): Promise<ContributionTypeSum[]> {
    const rows = await this.prisma.contribution.groupBy({
      by: ['contributionTypeId'],
      where: { ...contributionWhere(filter, span), status: 'RECORDED' },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      contributionTypeId: row.contributionTypeId,
      count: row._count._all,
      amount: sumOf(row._sum.amount),
    }));
  }

  async sumPendingConsolidation(
    filter: DataFilter,
    span: DateSpan,
  ): Promise<PendingConsolidation> {
    const total = await this.prisma.contribution.aggregate({
      where: {
        ...contributionWhere(filter, span),
        status: 'RECORDED',
        cashTransactionId: null,
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return { count: total._count._all, amount: sumOf(total._sum.amount) };
  }

  async sumContributionsByDay(
    filter: DataFilter,
    span: DateSpan,
  ): Promise<DailyAmount[]> {
    const rows = await this.prisma.contribution.groupBy({
      by: ['receivedOn'],
      where: { ...contributionWhere(filter, span), status: 'RECORDED' },
      _sum: { amount: true },
    });
    return rows.map((row) => ({
      date: toIsoDate(row.receivedOn),
      amount: sumOf(row._sum.amount),
    }));
  }

  async countContributions(
    filter: DataFilter,
    span: DateSpan,
  ): Promise<number> {
    return await this.prisma.contribution.count({
      where: { ...contributionWhere(filter, span), status: 'RECORDED' },
    });
  }

  async listContributionDetail(
    filter: DataFilter,
    span: DateSpan,
    limit: number,
  ): Promise<ContributionDetailData[]> {
    const rows = await this.prisma.contribution.findMany({
      where: contributionWhere(filter, span),
      orderBy: [{ receivedOn: 'asc' }, { id: 'asc' }],
      take: limit,
      select: DETAIL_SELECT,
    });
    return rows.map((row) => ({
      id: row.id,
      receivedOn: toIsoDate(row.receivedOn),
      receipt: row.voucher
        ? formatVoucherCode(
            row.voucher.type,
            row.voucher.issuedOn,
            row.voucher.number,
          )
        : null,
      congregationName: row.congregation.name,
      contributionType: row.contributionType.name,
      contributorName: row.person
        ? row.person.fullName?.trim() ||
          composeFullName(
            row.person.firstName,
            row.person.lastName,
            row.person.secondLastName,
          ) ||
          null
        : null,
      paymentMethod: row.paymentMethod,
      paymentReference: row.paymentReference,
      fundName:
        row.cashTransaction?.fund.name ??
        row.contributionType.account.defaultFund?.name ??
        null,
      amount: decimalToNumber(row.amount),
      status:
        row.status === 'VOIDED'
          ? 'VOIDED'
          : row.titheSettlementId !== null
            ? 'SETTLED'
            : 'RECORDED',
    }));
  }
}
