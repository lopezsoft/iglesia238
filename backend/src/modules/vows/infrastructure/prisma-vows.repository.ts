import { Injectable } from '@nestjs/common';
import {
  decimalToNumber,
  parseIsoDate,
  toIsoDate,
  toIsoDateOrNull,
} from '../../../common/mappers/value-mappers.js';
import {
  type Page,
  buildPage,
  toSkipTake,
} from '../../../common/pagination/page.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  CURRENT_REGISTRY_ENTRY,
  personMatchesText,
} from '../../../infrastructure/prisma/contributor-search.filter.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { ContributorCandidate } from '../../contributions/application/search-contributors.use-case.js';
import {
  CONTRIBUTOR_SELECT,
  toContributorCandidate,
} from '../../contributions/infrastructure/contributor-candidate.js';
import {
  memberCodeOf,
  shortPersonName,
} from '../../contributions/domain/contribution-rules.js';
import type {
  VowPaymentRecord,
  VowPledgeDetailRecord,
  VowPledgeFigures,
  VowPledgeRecord,
  VowTypeOption,
} from '../application/vow-pledge.models.js';
import type {
  LockedPledge,
  NewVowPledgeData,
  VowPledgeChanges,
  VowPledgeFilter,
  VowsRepository,
  VowTypeInfo,
} from '../application/vows.repository.js';
import {
  type VowPledgeStatus,
  pledgeIdFromCode,
} from '../domain/vow-pledge-rules.js';
import { PrismaVowPledgeLedger } from './prisma-vow-pledge-ledger.js';

const PLEDGE_SELECT = {
  id: true,
  congregationId: true,
  personId: true,
  contributionTypeId: true,
  description: true,
  pledgedAmount: true,
  pledgedOn: true,
  dueOn: true,
  status: true,
  congregation: { select: { name: true } },
  contributionType: { select: { name: true } },
  person: {
    select: {
      firstName: true,
      lastName: true,
      fullName: true,
      documentNumber: true,
      documentType: { select: { code: true } },
      member: { select: { memberRegistryEntries: CURRENT_REGISTRY_ENTRY } },
    },
  },
} satisfies Prisma.VowPledgeSelect;

type PledgeRow = Prisma.VowPledgeGetPayload<{ select: typeof PLEDGE_SELECT }>;

interface PaidFigures {
  paid: number;
  count: number;
  lastPaymentOn: string | null;
}

const NO_PAYMENTS: PaidFigures = { paid: 0, count: 0, lastPaymentOn: null };

@Injectable()
export class PrismaVowsRepository
  extends TenantScopedRepository
  implements VowsRepository
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

  async listVowTypes(scope: TenantScope): Promise<VowTypeOption[]> {
    return this.prisma.contributionType.findMany({
      where: {
        denominationId: scope.denominationId,
        category: 'VOW',
        isActive: true,
      },
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });
  }

  async findType(
    scope: TenantScope,
    typeId: number,
  ): Promise<VowTypeInfo | null> {
    return this.prisma.contributionType.findFirst({
      where: { id: typeId, denominationId: scope.denominationId },
      select: { id: true, category: true, isActive: true },
    });
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
    filter: VowPledgeFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<VowPledgeRecord>> {
    const where = this.buildWhere(scope, filter);
    const [rows, total] = await Promise.all([
      this.prisma.vowPledge.findMany({
        where,
        orderBy: [{ pledgedOn: 'desc' }, { id: 'desc' }],
        ...toSkipTake(page),
        select: PLEDGE_SELECT,
      }),
      this.prisma.vowPledge.count({ where }),
    ]);
    return buildPage(await this.withPayments(scope, rows), total, page);
  }

  async findAll(
    scope: TenantScope,
    filter: VowPledgeFilter,
    limit: number,
  ): Promise<VowPledgeRecord[]> {
    const rows = await this.prisma.vowPledge.findMany({
      where: this.buildWhere(scope, filter),
      orderBy: [{ pledgedOn: 'desc' }, { id: 'desc' }],
      take: limit,
      select: PLEDGE_SELECT,
    });
    return this.withPayments(scope, rows);
  }

  async statusCounts(
    scope: TenantScope,
  ): Promise<Record<VowPledgeStatus, number>> {
    const groups = await this.prisma.vowPledge.groupBy({
      by: ['status'],
      where: this.scoped(scope),
      _count: { _all: true },
    });
    const counts: Record<VowPledgeStatus, number> = {
      ACTIVE: 0,
      FULFILLED: 0,
      CANCELLED: 0,
    };
    for (const group of groups) {
      counts[group.status] = group._count._all;
    }
    return counts;
  }

  async listFigures(scope: TenantScope): Promise<VowPledgeFigures[]> {
    const pledges = await this.prisma.vowPledge.findMany({
      where: this.scoped(scope, { status: { not: 'CANCELLED' as const } }),
      select: {
        id: true,
        pledgedAmount: true,
        pledgedOn: true,
        dueOn: true,
        status: true,
      },
    });
    const payments = await this.paymentsByPledge(
      scope.denominationId,
      pledges.map((pledge) => pledge.id),
    );
    return pledges.map((pledge) => {
      const figures = payments.get(pledge.id) ?? NO_PAYMENTS;
      return {
        id: pledge.id,
        pledgedAmount: decimalToNumber(pledge.pledgedAmount),
        pledgedOn: toIsoDate(pledge.pledgedOn),
        dueOn: toIsoDateOrNull(pledge.dueOn),
        status: pledge.status,
        paid: figures.paid,
        lastPaymentOn: figures.lastPaymentOn,
      };
    });
  }

  async findById(
    scope: TenantScope,
    id: number,
  ): Promise<VowPledgeDetailRecord | null> {
    const row = await this.prisma.vowPledge.findFirst({
      where: this.scoped(scope, { id }),
      select: {
        ...PLEDGE_SELECT,
        contributionType: {
          select: {
            name: true,
            account: { select: { defaultFund: { select: { name: true } } } },
          },
        },
      },
    });
    if (!row) {
      return null;
    }
    // Payments of the whole denomination: the member may have paid from another sede after a transfer.
    const [payments, cancelReason] = await Promise.all([
      this.listPayments(scope.denominationId, id),
      row.status === 'CANCELLED'
        ? this.cancelReasonOf(scope.denominationId, id)
        : null,
    ]);
    const valid = payments.filter((payment) => payment.status !== 'VOIDED');
    const figures: PaidFigures = {
      paid: valid.reduce((sum, p) => sum + Math.round(p.amount * 100), 0) / 100,
      count: valid.length,
      lastPaymentOn: valid.reduce<string | null>(
        (last, p) =>
          last === null || p.receivedOn > last ? p.receivedOn : last,
        null,
      ),
    };
    return {
      ...this.toRecord(row, figures),
      documentTypeCode: row.person.documentType?.code ?? null,
      documentNumber: row.person.documentNumber,
      fundName: row.contributionType.account.defaultFund?.name ?? null,
      payments,
      cancelReason,
    };
  }

  async findActive(
    scope: TenantScope,
    personId: number,
    contributionTypeId: number,
  ): Promise<VowPledgeRecord[]> {
    const rows = await this.prisma.vowPledge.findMany({
      where: {
        denominationId: scope.denominationId,
        personId,
        contributionTypeId,
        status: 'ACTIVE',
      },
      orderBy: [{ pledgedOn: 'asc' }, { id: 'asc' }],
      select: PLEDGE_SELECT,
    });
    return this.withPayments(scope, rows);
  }

  async findContributor(
    scope: TenantScope,
    personId: number,
  ): Promise<ContributorCandidate | null> {
    const row = await this.prisma.person.findFirst({
      where: {
        id: personId,
        denominationId: scope.denominationId,
        deletedAt: null,
      },
      select: CONTRIBUTOR_SELECT,
    });
    return row ? toContributorCandidate(row) : null;
  }

  async create(
    scope: TenantScope,
    data: NewVowPledgeData,
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(this.prisma, transaction).vowPledge.create({
      data: {
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
        personId: data.personId,
        contributionTypeId: data.contributionTypeId,
        pledgedAmount: data.pledgedAmount,
        pledgedOn: parseIsoDate(data.pledgedOn),
        dueOn: data.dueOn ? parseIsoDate(data.dueOn) : null,
        description: data.description,
      },
      select: { id: true },
    });
    return created.id;
  }

  lock(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<LockedPledge | null> {
    return this.lockInScope(scope, id, transaction);
  }

  async cancel(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<boolean> {
    const result = await clientOf(
      this.prisma,
      transaction,
    ).vowPledge.updateMany({
      where: this.scoped(scope, { id, status: 'ACTIVE' as const }),
      data: { status: 'CANCELLED' },
    });
    return result.count === 1;
  }

  async update(
    scope: TenantScope,
    id: number,
    changes: VowPledgeChanges,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).vowPledge.updateMany({
      where: this.scoped(scope, { id }),
      data: {
        ...(changes.pledgedAmount !== undefined && {
          pledgedAmount: changes.pledgedAmount,
        }),
        ...(changes.dueOn !== undefined && {
          dueOn: changes.dueOn ? parseIsoDate(changes.dueOn) : null,
        }),
        ...(changes.description !== undefined && {
          description: changes.description,
        }),
      },
    });
  }

  refreshStatus(scope: TenantScope, id: number, transaction: Transaction) {
    return this.ledger.refreshStatus(scope.denominationId, id, transaction);
  }

  /** The pledge must be in the scope (a sede), then the ledger locks it. */
  private async lockInScope(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<LockedPledge | null> {
    const locked = await this.ledger.lock(
      scope.denominationId,
      id,
      transaction,
    );
    if (!locked) {
      return null;
    }
    if (
      scope.congregationId !== null &&
      locked.congregationId !== scope.congregationId
    ) {
      return null;
    }
    return locked;
  }

  private buildWhere(
    scope: TenantScope,
    filter: VowPledgeFilter,
  ): Prisma.VowPledgeWhereInput {
    const and: Prisma.VowPledgeWhereInput[] = [];
    if (filter.status) {
      and.push({ status: filter.status });
    }
    if (filter.contributionTypeId !== undefined) {
      and.push({ contributionTypeId: filter.contributionTypeId });
    }
    if (filter.overdueOnly && filter.today) {
      and.push({ status: 'ACTIVE', dueOn: { lt: parseIsoDate(filter.today) } });
    }
    if (filter.search) {
      const code = pledgeIdFromCode(filter.search);
      and.push({
        OR: [
          { person: { is: personMatchesText(filter.search) } },
          { description: { contains: filter.search } },
          ...(code !== null ? [{ id: code }] : []),
        ],
      });
    }
    return this.scoped(scope, { AND: and });
  }

  private async withPayments(
    scope: TenantScope,
    rows: readonly PledgeRow[],
  ): Promise<VowPledgeRecord[]> {
    const payments = await this.paymentsByPledge(
      scope.denominationId,
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      this.toRecord(row, payments.get(row.id) ?? NO_PAYMENTS),
    );
  }

  private toRecord(row: PledgeRow, figures: PaidFigures): VowPledgeRecord {
    const entry = row.person.member?.memberRegistryEntries[0];
    return {
      id: row.id,
      congregationId: row.congregationId,
      congregationName: row.congregation.name,
      personId: row.personId,
      personName: shortPersonName(row.person) ?? '—',
      memberCode: memberCodeOf(
        entry
          ? {
              memberNumber: entry.memberNumber,
              congregationCode: entry.congregation.code,
            }
          : null,
      ),
      contributionTypeId: row.contributionTypeId,
      typeName: row.contributionType.name,
      description: row.description,
      pledgedAmount: decimalToNumber(row.pledgedAmount),
      pledgedOn: toIsoDate(row.pledgedOn),
      dueOn: toIsoDateOrNull(row.dueOn),
      storedStatus: row.status,
      paid: figures.paid,
      paymentCount: figures.count,
      lastPaymentOn: figures.lastPaymentOn,
    };
  }

  /** Sum, count and last date of the valid payments of each pledge, in one query. */
  private async paymentsByPledge(
    denominationId: number,
    pledgeIds: readonly number[],
  ): Promise<Map<number, PaidFigures>> {
    const result = new Map<number, PaidFigures>();
    if (pledgeIds.length === 0) {
      return result;
    }
    const groups = await this.prisma.contribution.groupBy({
      by: ['vowPledgeId'],
      where: {
        denominationId,
        vowPledgeId: { in: [...pledgeIds] },
        status: 'RECORDED',
      },
      _sum: { amount: true },
      _count: { _all: true },
      _max: { receivedOn: true },
    });
    for (const group of groups) {
      if (group.vowPledgeId !== null) {
        result.set(group.vowPledgeId, {
          paid: group._sum.amount ? decimalToNumber(group._sum.amount) : 0,
          count: group._count._all,
          lastPaymentOn: toIsoDateOrNull(group._max.receivedOn),
        });
      }
    }
    return result;
  }

  private async listPayments(
    denominationId: number,
    pledgeId: number,
  ): Promise<VowPaymentRecord[]> {
    const rows = await this.prisma.contribution.findMany({
      where: { denominationId, vowPledgeId: pledgeId },
      orderBy: [{ receivedOn: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        receivedOn: true,
        amount: true,
        paymentMethod: true,
        status: true,
        titheSettlementId: true,
        voucher: { select: { number: true } },
        congregation: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      receivedOn: toIsoDate(row.receivedOn),
      receiptNumber: row.voucher?.number ?? null,
      amount: decimalToNumber(row.amount),
      paymentMethod: row.paymentMethod,
      status:
        row.status === 'VOIDED'
          ? ('VOIDED' as const)
          : row.titheSettlementId !== null
            ? ('SETTLED' as const)
            : ('RECORDED' as const),
      congregationName: row.congregation.name,
    }));
  }

  /** The reason lives in the audit trail: the pledge has no column for it. */
  private async cancelReasonOf(
    denominationId: number,
    pledgeId: number,
  ): Promise<string | null> {
    const entry = await this.prisma.auditLog.findFirst({
      where: {
        denominationId,
        entity: 'VowPledge',
        entityId: String(pledgeId),
        action: 'VOW_PLEDGE_CANCELLED',
      },
      orderBy: { id: 'desc' },
      select: { changes: true },
    });
    const changes = entry?.changes as
      { reason?: { to?: unknown } } | null | undefined;
    const reason = changes?.reason?.to;
    return typeof reason === 'string' ? reason : null;
  }
}
