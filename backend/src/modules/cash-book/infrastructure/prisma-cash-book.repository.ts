import { Injectable } from '@nestjs/common';
import {
  fromCents,
  signedCents,
  toCents,
} from '../../../common/accounting/accounting-rules.js';
import type { PeriodRecord } from '../../../common/accounting/period-view.js';
import {
  decimalToNumber,
  parseIsoDate,
  toIsoDate,
} from '../../../common/mappers/value-mappers.js';
import { SequenceKeys } from '../../../common/numbering/document-numbering.service.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  CashAccountRecord,
  CashBookRepository,
  CashFundRecord,
  CashLineRecord,
  LineFilter,
  LineIndexEntry,
  NewTransaction,
  PendingContribution,
  VoucherRef,
} from '../application/cash-book.repository.js';

const PERIOD_SELECT = {
  id: true,
  year: true,
  month: true,
  status: true,
  closedAt: true,
} as const;

const ACCOUNT_SELECT = {
  id: true,
  code: true,
  name: true,
  nature: true,
  isPostable: true,
  isActive: true,
  defaultFundId: true,
} as const;

const VOUCHER_SELECT = { type: true, number: true, issuedOn: true } as const;

const LINE_INCLUDE = {
  account: { select: { code: true, name: true } },
  voucher: { select: VOUCHER_SELECT },
  reversalOf: { select: { voucher: { select: VOUCHER_SELECT } } },
  reversedBy: { select: { id: true, voucher: { select: VOUCHER_SELECT } } },
} as const;

type LineRow = Prisma.CashTransactionGetPayload<{
  include: typeof LINE_INCLUDE;
}>;

function voucherRef(
  voucher: { type: string; number: number; issuedOn: Date } | null,
): VoucherRef | null {
  return voucher
    ? {
        type: voucher.type,
        number: voucher.number,
        issuedOn: toIsoDate(voucher.issuedOn),
      }
    : null;
}

function toLine(row: LineRow, dates: readonly string[]): CashLineRecord {
  return {
    id: row.id,
    postedOn: toIsoDate(row.postedOn),
    accountId: row.accountId,
    accountCode: row.account.code,
    accountName: row.account.name,
    fundId: row.fundId,
    description: row.description,
    direction: row.direction,
    amount: decimalToNumber(row.amount),
    voucher: voucherRef(row.voucher),
    reversalOfId: row.reversalOfId,
    reversalOfVoucher: voucherRef(row.reversalOf?.voucher ?? null),
    reversedBy: row.reversedBy
      ? { id: row.reversedBy.id, voucher: voucherRef(row.reversedBy.voucher) }
      : null,
    consolidatedDates: dates,
  };
}

/** Prisma adapter of the cash book: every query carries the denomination and the congregation. */
@Injectable()
export class PrismaCashBookRepository implements CashBookRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- Catalogs ------------------------------------------------------------------------------------

  listFunds(scope: TenantScope): Promise<CashFundRecord[]> {
    return this.prisma.fund.findMany({
      where: { denominationId: scope.denominationId },
      select: { id: true, name: true, isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  findFund(scope: TenantScope, id: number): Promise<CashFundRecord | null> {
    return this.prisma.fund.findFirst({
      where: { id, denominationId: scope.denominationId },
      select: { id: true, name: true, isActive: true },
    });
  }

  listPostableAccounts(scope: TenantScope): Promise<CashAccountRecord[]> {
    return this.prisma.account.findMany({
      where: {
        denominationId: scope.denominationId,
        isPostable: true,
        isActive: true,
      },
      select: ACCOUNT_SELECT,
      orderBy: { code: 'asc' },
    });
  }

  listAccounts(
    scope: TenantScope,
    ids: readonly number[],
  ): Promise<CashAccountRecord[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.account.findMany({
      where: { denominationId: scope.denominationId, id: { in: [...ids] } },
      select: ACCOUNT_SELECT,
    });
  }

  findAccount(
    scope: TenantScope,
    id: number,
  ): Promise<CashAccountRecord | null> {
    return this.prisma.account.findFirst({
      where: { id, denominationId: scope.denominationId },
      select: ACCOUNT_SELECT,
    });
  }

  // --- Periods -------------------------------------------------------------------------------------

  listPeriods(scope: TenantScope): Promise<PeriodRecord[]> {
    return this.prisma.accountingPeriod.findMany({
      where: this.sede(scope),
      select: PERIOD_SELECT,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  findPeriod(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<PeriodRecord | null> {
    return clientOf(this.prisma, transaction).accountingPeriod.findFirst({
      where: { id, ...this.sede(scope) },
      select: PERIOD_SELECT,
    });
  }

  closePeriod(
    scope: TenantScope,
    id: number,
    closedAt: Date,
    transaction: Transaction,
  ): Promise<PeriodRecord> {
    return clientOf(this.prisma, transaction).accountingPeriod.update({
      where: {
        denominationId_congregationId_id: { ...this.sede(scope), id },
      },
      data: { status: 'CLOSED', closedAt },
      select: PERIOD_SELECT,
    });
  }

  async ensurePeriod(
    scope: TenantScope,
    period: { year: number; month: number },
    transaction: Transaction,
  ): Promise<PeriodRecord> {
    const client = clientOf(this.prisma, transaction);
    const existing = await client.accountingPeriod.findFirst({
      where: { ...this.sede(scope), year: period.year, month: period.month },
      select: PERIOD_SELECT,
    });
    return (
      existing ??
      client.accountingPeriod.create({
        data: { ...this.sede(scope), year: period.year, month: period.month },
        select: PERIOD_SELECT,
      })
    );
  }

  async carryOpeningBalances(
    scope: TenantScope,
    year: number,
    transaction: Transaction,
  ): Promise<number> {
    const client = clientOf(this.prisma, transaction);
    const sede = this.sede(scope);
    const [openings, moved, existing] = await Promise.all([
      client.fundOpeningBalance.findMany({
        where: { ...sede, year },
        select: { fundId: true, amount: true },
      }),
      client.cashTransaction.groupBy({
        by: ['fundId', 'direction'],
        where: {
          ...sede,
          postedOn: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
        },
        _sum: { amount: true },
      }),
      client.fundOpeningBalance.findMany({
        where: { ...sede, year: year + 1 },
        select: { fundId: true },
      }),
    ]);

    const closing = new Map<number, number>();
    for (const row of openings) {
      closing.set(row.fundId, toCents(decimalToNumber(row.amount)));
    }
    for (const row of moved) {
      const cents = toCents(
        row._sum.amount ? decimalToNumber(row._sum.amount) : 0,
      );
      closing.set(
        row.fundId,
        (closing.get(row.fundId) ?? 0) + signedCents(row.direction, cents),
      );
    }
    const taken = new Set(existing.map((row) => row.fundId));
    const data = [...closing.entries()]
      .filter(([fundId]) => !taken.has(fundId))
      .map(([fundId, cents]) => ({
        ...sede,
        fundId,
        year: year + 1,
        amount: fromCents(cents),
      }));
    if (data.length > 0) {
      await client.fundOpeningBalance.createMany({ data });
    }
    return data.length;
  }

  // --- Reading the book ----------------------------------------------------------------------------

  async lineIndex(
    scope: TenantScope,
    fundId: number,
    periodId: number,
  ): Promise<LineIndexEntry[]> {
    const rows = await this.prisma.cashTransaction.findMany({
      where: { ...this.sede(scope), fundId, periodId },
      select: { id: true, direction: true, amount: true },
      orderBy: [{ postedOn: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      direction: row.direction,
      amount: decimalToNumber(row.amount),
    }));
  }

  async openingBase(
    scope: TenantScope,
    fundId: number,
    year: number,
    beforeDate: string,
  ): Promise<{ yearOpening: number; movedBefore: number }> {
    const sede = this.sede(scope);
    const [opening, moved] = await Promise.all([
      this.prisma.fundOpeningBalance.findUnique({
        where: {
          congregationId_fundId_year: {
            congregationId: sede.congregationId,
            fundId,
            year,
          },
        },
        select: { amount: true },
      }),
      this.prisma.cashTransaction.groupBy({
        by: ['direction'],
        where: {
          ...sede,
          fundId,
          postedOn: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lt: parseIsoDate(beforeDate),
          },
        },
        _sum: { amount: true },
      }),
    ]);
    const movedCents = moved.reduce(
      (sum, row) =>
        sum +
        signedCents(
          row.direction,
          toCents(row._sum.amount ? decimalToNumber(row._sum.amount) : 0),
        ),
      0,
    );
    return {
      yearOpening: opening ? decimalToNumber(opening.amount) : 0,
      movedBefore: fromCents(movedCents),
    };
  }

  async findLines(
    scope: TenantScope,
    filter: LineFilter,
  ): Promise<{ rows: CashLineRecord[]; total: number }> {
    const where: Prisma.CashTransactionWhereInput = {
      ...this.sede(scope),
      fundId: filter.fundId,
      periodId: filter.periodId,
      ...(filter.direction ? { direction: filter.direction } : {}),
      ...(filter.accountId ? { accountId: filter.accountId } : {}),
      ...(filter.search
        ? {
            OR: [
              { description: { contains: filter.search } },
              { account: { code: { startsWith: filter.search } } },
              { account: { name: { contains: filter.search } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.cashTransaction.findMany({
        where,
        include: LINE_INCLUDE,
        orderBy: [{ postedOn: 'asc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.cashTransaction.count({ where }),
    ]);
    return { rows: await this.withDates(scope, rows), total };
  }

  async findLine(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<CashLineRecord | null> {
    const row = await clientOf(
      this.prisma,
      transaction,
    ).cashTransaction.findFirst({
      where: { id, ...this.sede(scope) },
      include: LINE_INCLUDE,
    });
    return row ? (await this.withDates(scope, [row], transaction))[0] : null;
  }

  async peekNextVoucherNumber(
    scope: TenantScope,
    type: string,
  ): Promise<number> {
    const counter = await this.prisma.documentSequence.findUnique({
      where: {
        congregationId_key: {
          congregationId: scope.requireCongregationId(),
          key: SequenceKeys.voucher(type),
        },
      },
      select: { lastValue: true },
    });
    return (counter?.lastValue ?? 0) + 1;
  }

  // --- Writing the book ----------------------------------------------------------------------------

  createVoucher(
    scope: TenantScope,
    data: { type: string; number: number; issuedOn: string },
    transaction: Transaction,
  ): Promise<{ id: number }> {
    return clientOf(this.prisma, transaction).voucher.create({
      data: {
        ...this.sede(scope),
        type: data.type,
        number: data.number,
        issuedOn: parseIsoDate(data.issuedOn),
      },
      select: { id: true },
    });
  }

  createTransaction(
    scope: TenantScope,
    data: NewTransaction,
    transaction: Transaction,
  ): Promise<{ id: number }> {
    return clientOf(this.prisma, transaction).cashTransaction.create({
      data: {
        ...this.sede(scope),
        periodId: data.periodId,
        accountId: data.accountId,
        fundId: data.fundId,
        voucherId: data.voucherId,
        direction: data.direction,
        postedOn: parseIsoDate(data.postedOn),
        amount: data.amount,
        description: data.description,
        reversalOfId: data.reversalOfId,
        createdById: data.createdById,
      },
      select: { id: true },
    });
  }

  // --- Contributions -------------------------------------------------------------------------------

  async listPendingContributions(
    scope: TenantScope,
    date: string,
  ): Promise<PendingContribution[]> {
    const rows = await this.prisma.contribution.findMany({
      where: {
        ...this.sede(scope),
        status: 'RECORDED',
        cashTransactionId: null,
        receivedOn: parseIsoDate(date),
      },
      select: {
        id: true,
        amount: true,
        receivedOn: true,
        contributionType: {
          select: {
            accountId: true,
            account: { select: { defaultFundId: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      amount: decimalToNumber(row.amount),
      receivedOn: toIsoDate(row.receivedOn),
      accountId: row.contributionType.accountId,
      defaultFundId: row.contributionType.account.defaultFundId,
    }));
  }

  countPendingContributions(
    scope: TenantScope,
    from: string,
    to: string,
  ): Promise<number> {
    return this.prisma.contribution.count({
      where: {
        ...this.sede(scope),
        status: 'RECORDED',
        cashTransactionId: null,
        receivedOn: { gte: parseIsoDate(from), lte: parseIsoDate(to) },
      },
    });
  }

  async linkContributions(
    scope: TenantScope,
    ids: readonly number[],
    cashTransactionId: number,
    transaction: Transaction,
  ): Promise<number> {
    const result = await clientOf(
      this.prisma,
      transaction,
    ).contribution.updateMany({
      where: {
        ...this.sede(scope),
        id: { in: [...ids] },
        status: 'RECORDED',
        cashTransactionId: null,
      },
      data: { cashTransactionId },
    });
    return result.count;
  }

  async releaseContributions(
    scope: TenantScope,
    cashTransactionId: number,
    transaction: Transaction,
  ): Promise<number> {
    const result = await clientOf(
      this.prisma,
      transaction,
    ).contribution.updateMany({
      where: { ...this.sede(scope), cashTransactionId },
      data: { cashTransactionId: null },
    });
    return result.count;
  }

  // --- Helpers -------------------------------------------------------------------------------------

  /** Denomination and congregation of the scope; a cash book never reads without both. */
  private sede(scope: TenantScope): {
    denominationId: number;
    congregationId: number;
  } {
    return {
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
    };
  }

  /** Adds, to each line, the reception dates of the contributions it consolidates. */
  private async withDates(
    scope: TenantScope,
    rows: readonly LineRow[],
    transaction?: Transaction,
  ): Promise<CashLineRecord[]> {
    if (rows.length === 0) {
      return [];
    }
    const contributions = await clientOf(
      this.prisma,
      transaction,
    ).contribution.findMany({
      where: {
        ...this.sede(scope),
        cashTransactionId: { in: rows.map((row) => row.id) },
      },
      select: { cashTransactionId: true, receivedOn: true },
      distinct: ['cashTransactionId', 'receivedOn'],
    });
    const byLine = new Map<number, string[]>();
    for (const contribution of contributions) {
      if (contribution.cashTransactionId === null) {
        continue;
      }
      const dates = byLine.get(contribution.cashTransactionId) ?? [];
      dates.push(toIsoDate(contribution.receivedOn));
      byLine.set(contribution.cashTransactionId, dates);
    }
    return rows.map((row) => toLine(row, byLine.get(row.id) ?? []));
  }
}
