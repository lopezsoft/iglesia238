import { Injectable } from '@nestjs/common';
import {
  fromCents,
  toCents,
} from '../../../common/accounting/accounting-rules.js';
import {
  decimalToNumber,
  parseIsoDate,
  toIsoDate,
} from '../../../common/mappers/value-mappers.js';
import { composeFullName } from '../../../common/people/full-name.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  VoucherDetailRecord,
  VoucherFilter,
  VoucherLetterhead,
  VoucherReadRepository,
  VoucherRecord,
} from '../application/voucher.repository.js';

const SUMMARY_INCLUDE = {
  cashTransactions: { select: { amount: true } },
  contributions: { select: { amount: true } },
  titheSettlement: { select: { grossTithe: true } },
} as const;

const DETAIL_INCLUDE = {
  cashTransactions: {
    include: {
      account: { select: { code: true, name: true } },
      fund: { select: { name: true } },
    },
    orderBy: [{ postedOn: 'asc' }, { id: 'asc' }],
  },
  contributions: {
    include: {
      contributionType: { select: { name: true } },
      person: {
        select: {
          fullName: true,
          firstName: true,
          lastName: true,
          secondLastName: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  },
  titheSettlement: { select: { grossTithe: true } },
} as const satisfies Prisma.VoucherInclude;

function sum(amounts: readonly { amount: { toNumber(): number } }[]): number {
  return fromCents(
    amounts.reduce(
      (total, row) => total + toCents(decimalToNumber(row.amount)),
      0,
    ),
  );
}

type SummaryRow = Prisma.VoucherGetPayload<{ include: typeof SUMMARY_INCLUDE }>;

function toRecord(row: SummaryRow): VoucherRecord {
  return {
    id: row.id,
    type: row.type,
    number: row.number,
    issuedOn: toIsoDate(row.issuedOn),
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    linesAmount: sum(row.cashTransactions),
    linesCount: row.cashTransactions.length,
    contributionsAmount: sum(row.contributions),
    contributionsCount: row.contributions.length,
    settlementGross: row.titheSettlement
      ? decimalToNumber(row.titheSettlement.grossTithe)
      : null,
  };
}

@Injectable()
export class PrismaVoucherReadRepository implements VoucherReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    scope: TenantScope,
    filter: VoucherFilter,
  ): Promise<{ rows: VoucherRecord[]; total: number }> {
    const where: Prisma.VoucherWhereInput = {
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      type: { in: [...filter.types] },
      ...(filter.from || filter.to
        ? {
            issuedOn: {
              ...(filter.from ? { gte: parseIsoDate(filter.from) } : {}),
              ...(filter.to ? { lte: parseIsoDate(filter.to) } : {}),
            },
          }
        : {}),
      ...(filter.voided === undefined
        ? {}
        : { voidedAt: filter.voided ? { not: null } : null }),
      ...(filter.number === undefined ? {} : { number: filter.number }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.voucher.findMany({
        where,
        include: SUMMARY_INCLUDE,
        orderBy: [{ issuedOn: 'desc' }, { id: 'desc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.voucher.count({ where }),
    ]);
    return { rows: rows.map(toRecord), total };
  }

  async find(
    scope: TenantScope,
    id: number,
  ): Promise<VoucherDetailRecord | null> {
    const row = await this.prisma.voucher.findFirst({
      where: {
        id,
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
      },
      include: DETAIL_INCLUDE,
    });
    if (!row) {
      return null;
    }
    const letterhead = await this.findLetterhead(scope);
    if (!letterhead) {
      return null;
    }
    return {
      letterhead,
      id: row.id,
      type: row.type,
      number: row.number,
      issuedOn: toIsoDate(row.issuedOn),
      voidedAt: row.voidedAt,
      voidReason: row.voidReason,
      linesAmount: sum(row.cashTransactions),
      linesCount: row.cashTransactions.length,
      contributionsAmount: sum(row.contributions),
      contributionsCount: row.contributions.length,
      settlementGross: row.titheSettlement
        ? decimalToNumber(row.titheSettlement.grossTithe)
        : null,
      lines: row.cashTransactions.map((line) => ({
        id: line.id,
        postedOn: toIsoDate(line.postedOn),
        accountCode: line.account.code,
        accountName: line.account.name,
        fundName: line.fund.name,
        direction: line.direction,
        amount: decimalToNumber(line.amount),
        description: line.description,
        isReversal: line.reversalOfId !== null,
      })),
      contributions: row.contributions.map((contribution) => ({
        id: contribution.id,
        receivedOn: toIsoDate(contribution.receivedOn),
        typeName: contribution.contributionType.name,
        amount: decimalToNumber(contribution.amount),
        status: contribution.status,
        contributorName: contribution.person
          ? contribution.person.fullName?.trim() ||
            composeFullName(
              contribution.person.firstName,
              contribution.person.lastName,
              contribution.person.secondLastName,
            ) ||
            null
          : null,
        paymentMethod: contribution.paymentMethod,
      })),
    };
  }

  private async findLetterhead(
    scope: TenantScope,
  ): Promise<VoucherLetterhead | null> {
    const congregation = await this.prisma.congregation.findFirst({
      where: {
        id: scope.requireCongregationId(),
        denominationId: scope.denominationId,
      },
      select: {
        name: true,
        denomination: { select: { name: true } },
        legalEntity: { select: { legalName: true, taxId: true } },
      },
    });
    return congregation
      ? {
          denominationName: congregation.denomination.name,
          legalName: congregation.legalEntity.legalName,
          taxId: congregation.legalEntity.taxId,
          congregationName: congregation.name,
        }
      : null;
  }
}
