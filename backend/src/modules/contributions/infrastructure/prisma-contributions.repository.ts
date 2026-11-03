import { Injectable } from '@nestjs/common';
import {
  decimalToNumber,
  parseIsoDate,
  toIsoDate,
  toIsoDateTime,
  toIsoDateTimeOrNull,
  toIsoDateOrNull,
} from '../../../common/mappers/value-mappers.js';
import { SequenceKeys } from '../../../common/numbering/document-numbering.service.js';
import {
  type Page,
  buildPage,
  toSkipTake,
} from '../../../common/pagination/page.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import { VoucherTypes } from '../../../common/accounting/accounting-rules.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  CURRENT_REGISTRY_ENTRY,
  personMatchesText,
} from '../../../infrastructure/prisma/contributor-search.filter.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PrismaVowPledgeLedger } from '../../vows/infrastructure/prisma-vow-pledge-ledger.js';
import type {
  ContributionDetailRecord,
  ContributionRecord,
  ContributionTypeOption,
} from '../application/contribution.models.js';
import type {
  CategoryBreakdown,
  ContributionFilter,
  ContributionsRepository,
  ContributionTypeInfo,
  LockedVowPledge,
  NewContributionData,
  NewVoucherData,
  PeriodSummary,
} from '../application/contributions.repository.js';
import {
  memberCodeOf,
  shortPersonName,
  type CategoryTotal,
} from '../domain/contribution-rules.js';
import type { ContributionCategory } from '../domain/contribution.types.js';

const RECORD_SELECT = {
  id: true,
  congregationId: true,
  voucherId: true,
  receivedOn: true,
  contributionTypeId: true,
  personId: true,
  vowPledgeId: true,
  paymentMethod: true,
  paymentReference: true,
  notes: true,
  amount: true,
  status: true,
  titheSettlementId: true,
  cashTransactionId: true,
  voidReason: true,
  congregation: { select: { name: true } },
  contributionType: { select: { name: true, category: true } },
  voucher: { select: { number: true } },
  vowPledge: { select: { pledgedOn: true } },
  person: {
    select: {
      firstName: true,
      lastName: true,
      fullName: true,
      member: {
        select: { memberRegistryEntries: CURRENT_REGISTRY_ENTRY },
      },
    },
  },
} satisfies Prisma.ContributionSelect;

const DETAIL_SELECT = {
  ...RECORD_SELECT,
  createdAt: true,
  voidedAt: true,
  recordedBy: { select: { displayName: true } },
  voidedBy: { select: { displayName: true } },
  cashTransaction: {
    select: { voucher: { select: { number: true, issuedOn: true } } },
  },
} satisfies Prisma.ContributionSelect;

type RecordRow = Prisma.ContributionGetPayload<{
  select: typeof RECORD_SELECT;
}>;
type DetailRow = Prisma.ContributionGetPayload<{
  select: typeof DETAIL_SELECT;
}>;

const RECEIPT_TEXT = /^(?:REC-\d{4}-)?(\d{1,9})$/i;

function toRecord(row: RecordRow): ContributionRecord {
  const entry = row.person?.member?.memberRegistryEntries[0];
  return {
    id: row.id,
    congregationId: row.congregationId,
    congregationName: row.congregation.name,
    voucherId: row.voucherId,
    receiptNumber: row.voucher?.number ?? null,
    receivedOn: toIsoDate(row.receivedOn),
    contributionTypeId: row.contributionTypeId,
    typeName: row.contributionType.name,
    category: row.contributionType.category,
    personId: row.personId,
    contributorName: row.person ? shortPersonName(row.person) : null,
    memberCode: memberCodeOf(
      entry
        ? {
            memberNumber: entry.memberNumber,
            congregationCode: entry.congregation.code,
          }
        : null,
    ),
    vowPledgeId: row.vowPledgeId,
    vowPledgedOn: row.vowPledge ? toIsoDate(row.vowPledge.pledgedOn) : null,
    paymentMethod: row.paymentMethod,
    paymentReference: row.paymentReference,
    notes: row.notes,
    amount: decimalToNumber(row.amount),
    status: row.status,
    settled: row.titheSettlementId !== null,
    consolidated: row.cashTransactionId !== null,
    voidReason: row.voidReason,
  };
}

function toDetail(row: DetailRow): ContributionDetailRecord {
  const consolidation = row.cashTransaction?.voucher ?? null;
  return {
    ...toRecord(row),
    recordedAt: toIsoDateTime(row.createdAt),
    recordedByName: row.recordedBy.displayName,
    voidedAt: toIsoDateTimeOrNull(row.voidedAt),
    voidedByName: row.voidedBy?.displayName ?? null,
    consolidationNumber: consolidation?.number ?? null,
    consolidationIssuedOn: toIsoDateOrNull(consolidation?.issuedOn),
    settlementId: row.titheSettlementId,
  };
}

type WhereMode = 'all' | 'valid' | 'voided';

@Injectable()
export class PrismaContributionsRepository
  extends TenantScopedRepository
  implements ContributionsRepository
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: PrismaVowPledgeLedger,
  ) {
    super();
  }

  async congregationName(scope: TenantScope): Promise<string | null> {
    if (scope.congregationId === null) {
      return null;
    }
    const congregation = await this.prisma.congregation.findFirst({
      where: { id: scope.congregationId, denominationId: scope.denominationId },
      select: { name: true },
    });
    return congregation?.name ?? null;
  }

  async listActiveTypes(scope: TenantScope): Promise<ContributionTypeOption[]> {
    const types = await this.prisma.contributionType.findMany({
      where: { denominationId: scope.denominationId, isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, category: true },
    });
    return types;
  }

  async findType(
    scope: TenantScope,
    typeId: number,
  ): Promise<ContributionTypeInfo | null> {
    const type = await this.prisma.contributionType.findFirst({
      where: { id: typeId, denominationId: scope.denominationId },
      select: {
        id: true,
        name: true,
        category: true,
        isActive: true,
        account: { select: { isActive: true, isPostable: true, nature: true } },
      },
    });
    if (!type) {
      return null;
    }
    return {
      id: type.id,
      name: type.name,
      category: type.category,
      isActive: type.isActive,
      accountUsable:
        type.account.isActive &&
        type.account.isPostable &&
        type.account.nature === 'INCOME',
    };
  }

  async listPeriods(scope: TenantScope): Promise<PeriodSummary[]> {
    return this.prisma.accountingPeriod.findMany({
      where: this.scoped(scope),
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { year: true, month: true, status: true },
    });
  }

  async findPeriod(
    scope: TenantScope,
    year: number,
    month: number,
  ): Promise<PeriodSummary | null> {
    return this.prisma.accountingPeriod.findFirst({
      where: this.scoped(scope, { year, month }),
      select: { year: true, month: true, status: true },
    });
  }

  async listIssuedTitheRanges(
    scope: TenantScope,
  ): Promise<{ from: string; to: string }[]> {
    const settlements = await this.prisma.titheSettlement.findMany({
      where: this.scoped(scope, { status: 'ISSUED' as const }),
      select: { coveredFrom: true, coveredTo: true },
    });
    return settlements.map((s) => ({
      from: toIsoDate(s.coveredFrom),
      to: toIsoDate(s.coveredTo),
    }));
  }

  async peekNextReceiptNumber(scope: TenantScope): Promise<number> {
    const sequence = await this.prisma.documentSequence.findFirst({
      where: {
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
        key: SequenceKeys.voucher(VoucherTypes.receipt),
      },
      select: { lastValue: true },
    });
    return (sequence?.lastValue ?? 0) + 1;
  }

  async personExists(scope: TenantScope, personId: number): Promise<boolean> {
    const count = await this.prisma.person.count({
      where: {
        id: personId,
        denominationId: scope.denominationId,
        deletedAt: null,
      },
    });
    return count > 0;
  }

  async findPage(
    scope: TenantScope,
    filter: ContributionFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<ContributionRecord>> {
    const where = this.buildWhere(scope, filter, 'all');
    if (where === null) {
      return buildPage([], 0, page);
    }
    const [rows, total] = await Promise.all([
      this.prisma.contribution.findMany({
        where,
        orderBy: [{ receivedOn: 'desc' }, { id: 'desc' }],
        ...toSkipTake(page),
        select: RECORD_SELECT,
      }),
      this.prisma.contribution.count({ where }),
    ]);
    return buildPage(rows.map(toRecord), total, page);
  }

  async breakdown(
    scope: TenantScope,
    filter: ContributionFilter,
  ): Promise<CategoryBreakdown> {
    const validWhere = this.buildWhere(scope, filter, 'valid');
    const voidedWhere = this.buildWhere(scope, filter, 'voided');

    const [groups, voidedCount] = await Promise.all([
      validWhere
        ? this.prisma.contribution.groupBy({
            by: ['contributionTypeId'],
            where: validWhere,
            _sum: { amount: true },
            _count: { _all: true },
          })
        : [],
      voidedWhere ? this.prisma.contribution.count({ where: voidedWhere }) : 0,
    ]);

    const types = await this.prisma.contributionType.findMany({
      where: {
        denominationId: scope.denominationId,
        id: { in: groups.map((group) => group.contributionTypeId) },
      },
      select: { id: true, category: true },
    });
    const categoryOf = new Map<number, ContributionCategory>(
      types.map((type) => [type.id, type.category]),
    );
    const totals: CategoryTotal[] = groups.map((group) => ({
      category: categoryOf.get(group.contributionTypeId) ?? 'OTHER',
      amount: group._sum.amount ? decimalToNumber(group._sum.amount) : 0,
      count: group._count._all,
    }));
    return { totals, voidedCount };
  }

  async findAll(
    scope: TenantScope,
    filter: ContributionFilter,
    limit: number,
  ): Promise<ContributionRecord[]> {
    const where = this.buildWhere(scope, filter, 'all');
    if (where === null) {
      return [];
    }
    const rows = await this.prisma.contribution.findMany({
      where,
      orderBy: [{ receivedOn: 'desc' }, { id: 'desc' }],
      take: limit,
      select: RECORD_SELECT,
    });
    return rows.map(toRecord);
  }

  async findById(
    scope: TenantScope,
    id: number,
  ): Promise<ContributionDetailRecord | null> {
    const row = await this.prisma.contribution.findFirst({
      where: this.scoped(scope, { id }),
      select: DETAIL_SELECT,
    });
    return row ? toDetail(row) : null;
  }

  lockVowPledge(
    scope: TenantScope,
    pledgeId: number,
    transaction: Transaction,
  ): Promise<LockedVowPledge | null> {
    // The pledge may belong to another sede of the denomination: only the denomination is checked.
    return this.ledger.lock(scope.denominationId, pledgeId, transaction);
  }

  async createVoucher(
    scope: TenantScope,
    data: NewVoucherData,
    transaction: Transaction,
  ): Promise<number> {
    const voucher = await clientOf(this.prisma, transaction).voucher.create({
      data: {
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
        type: data.type,
        number: data.number,
        issuedOn: parseIsoDate(data.issuedOn),
      },
      select: { id: true },
    });
    return voucher.id;
  }

  async createContribution(
    scope: TenantScope,
    data: NewContributionData,
    transaction: Transaction,
  ): Promise<number> {
    const contribution = await clientOf(
      this.prisma,
      transaction,
    ).contribution.create({
      data: {
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
        contributionTypeId: data.contributionTypeId,
        personId: data.personId,
        vowPledgeId: data.vowPledgeId,
        voucherId: data.voucherId,
        receivedOn: parseIsoDate(data.receivedOn),
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        paymentReference: data.paymentReference,
        notes: data.notes,
        recordedById: data.recordedById,
      },
      select: { id: true },
    });
    return contribution.id;
  }

  async markVoided(
    scope: TenantScope,
    id: number,
    voidedById: number,
    reason: string,
    transaction: Transaction,
  ): Promise<boolean> {
    const result = await clientOf(
      this.prisma,
      transaction,
    ).contribution.updateMany({
      where: this.scoped(scope, {
        id,
        status: 'RECORDED' as const,
        cashTransactionId: null,
        titheSettlementId: null,
      }),
      data: {
        status: 'VOIDED',
        voidedById,
        voidedAt: new Date(),
        voidReason: reason,
      },
    });
    return result.count === 1;
  }

  async voidVoucher(
    scope: TenantScope,
    voucherId: number,
    reason: string,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).voucher.updateMany({
      where: this.scoped(scope, { id: voucherId }),
      data: { voidedAt: new Date(), voidReason: reason },
    });
  }

  refreshVowPledgeStatus(
    scope: TenantScope,
    pledgeId: number,
    transaction: Transaction,
  ) {
    return this.ledger.refreshStatus(
      scope.denominationId,
      pledgeId,
      transaction,
    );
  }

  /**
   * `where` of the list, the summary and the export. `valid` and `voided` narrow the status for
   * the totals; null means the filter can match nothing (for example "voided" inside "valid").
   */
  private buildWhere(
    scope: TenantScope,
    filter: ContributionFilter,
    mode: WhereMode,
  ): Prisma.ContributionWhereInput | null {
    const and: Prisma.ContributionWhereInput[] = [];

    switch (filter.status) {
      case 'RECORDED':
        and.push({ status: 'RECORDED', titheSettlementId: null });
        break;
      case 'SETTLED':
        and.push({ status: 'RECORDED', titheSettlementId: { not: null } });
        break;
      case 'VOIDED':
        and.push({ status: 'VOIDED' });
        break;
      case undefined:
        break;
    }
    if (mode === 'valid') {
      if (filter.status === 'VOIDED') {
        return null;
      }
      and.push({ status: 'RECORDED' });
    }
    if (mode === 'voided') {
      if (filter.status === 'RECORDED' || filter.status === 'SETTLED') {
        return null;
      }
      and.push({ status: 'VOIDED' });
    }
    if (filter.category) {
      and.push({ contributionType: { is: { category: filter.category } } });
    }
    if (filter.contributionTypeId !== undefined) {
      and.push({ contributionTypeId: filter.contributionTypeId });
    }
    if (filter.paymentMethod) {
      and.push({ paymentMethod: filter.paymentMethod });
    }
    if (filter.search) {
      and.push(this.searchClause(filter.search));
    }

    return this.scoped(scope, {
      receivedOn: {
        gte: parseIsoDate(filter.from),
        lte: parseIsoDate(filter.to),
      },
      AND: and,
    });
  }

  private searchClause(text: string): Prisma.ContributionWhereInput {
    const alternatives: Prisma.ContributionWhereInput[] = [
      { paymentReference: { contains: text } },
      { notes: { contains: text } },
      { person: { is: personMatchesText(text) } },
    ];
    const receipt = RECEIPT_TEXT.exec(text.trim());
    if (receipt) {
      alternatives.push({
        voucher: {
          is: { type: VoucherTypes.receipt, number: Number(receipt[1]) },
        },
      });
    }
    return { OR: alternatives };
  }
}
