import { Injectable } from '@nestjs/common';
import { ConflictDomainException } from '../../../common/errors/domain.exception.js';
import {
  parseIsoDate,
  toIsoDateOrNull,
} from '../../../common/mappers/value-mappers.js';
import {
  type Page,
  buildPage,
  toSkipTake,
} from '../../../common/pagination/page.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  MarriageRepository,
  NewMarriage,
} from '../application/ports/records.ports.js';
import {
  type MarriageEndReason,
  type MarriageFilter,
  type MarriageRecord,
  type MarriageRegistry,
  marriageCode,
} from '../application/records.models.js';
import {
  nameTokens,
  personNameMatches,
  personSummarySelect,
  toPersonSummary,
} from './person-summary.js';

const marriageInclude = {
  spouse1: { select: personSummarySelect },
  spouse2: { select: personSummarySelect },
  officiant: { select: personSummarySelect },
} satisfies Prisma.MarriageInclude;

type MarriageRow = Prisma.MarriageGetPayload<{
  include: typeof marriageInclude;
}>;

/** `tribunalOpinion` is never selected: it is restricted and no screen of this module shows it. */
@Injectable()
export class PrismaMarriageRepository implements MarriageRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(
    scope: TenantScope,
    filter: MarriageFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<MarriageRecord>> {
    const where = this.where(scope, filter);
    const [rows, total] = await Promise.all([
      this.prisma.marriage.findMany({
        where,
        include: marriageInclude,
        // MariaDB sorts NULL last in descending order: marriages without date go to the end.
        orderBy: [{ marriedOn: 'desc' }, { id: 'desc' }],
        ...toSkipTake(page),
      }),
      this.prisma.marriage.count({ where }),
    ]);
    return buildPage(
      rows.map((row) => this.toRecord(row)),
      total,
      page,
    );
  }

  async find(scope: TenantScope, id: number): Promise<MarriageRecord | null> {
    const row = await this.prisma.marriage.findFirst({
      where: { id, ...this.visible(scope) },
      include: marriageInclude,
    });
    return row ? this.toRecord(row) : null;
  }

  async hasActiveMarriage(
    scope: TenantScope,
    personIds: readonly number[],
    transaction: Transaction,
  ): Promise<boolean> {
    const count = await clientOf(this.prisma, transaction).marriage.count({
      where: {
        denominationId: scope.denominationId,
        endedOn: null,
        OR: [
          { spouse1Id: { in: [...personIds] } },
          { spouse2Id: { in: [...personIds] } },
        ],
      },
    });
    return count > 0;
  }

  async create(
    scope: TenantScope,
    data: NewMarriage,
    transaction: Transaction,
  ): Promise<MarriageRecord> {
    const row = await clientOf(this.prisma, transaction).marriage.create({
      data: {
        denominationId: scope.denominationId,
        spouse1Id: data.spouse1Id,
        spouse2Id: data.spouse2Id,
        registeredWith: data.registeredWith,
        isCivil: data.registeredWith === 'NOTARY',
        isChristian: data.registeredWith === 'CHURCH',
        isCatholic: false,
        marriedOn: parseIsoDate(data.marriedOn),
        place: data.place,
        officiantId: data.officiantId,
      },
      include: marriageInclude,
    });
    return this.toRecord(row);
  }

  async dissolve(
    scope: TenantScope,
    id: number,
    data: { endedOn: string; endReason: MarriageEndReason },
    transaction: Transaction,
  ): Promise<MarriageRecord> {
    const client = clientOf(this.prisma, transaction);
    const updated = await client.marriage.updateMany({
      where: { id, ...this.visible(scope), endedOn: null },
      data: { endedOn: parseIsoDate(data.endedOn), endReason: data.endReason },
    });
    if (updated.count === 0) {
      throw new ConflictDomainException(
        'Este matrimonio ya tiene registrada su disolución.',
        'ALREADY_DISSOLVED',
      );
    }
    const row = await client.marriage.findFirstOrThrow({
      where: { id, denominationId: scope.denominationId },
      include: marriageInclude,
    });
    return this.toRecord(row);
  }

  async counts(
    scope: TenantScope,
  ): Promise<{ active: number; dissolved: number }> {
    const where = this.visible(scope);
    const [active, dissolved] = await Promise.all([
      this.prisma.marriage.count({ where: { ...where, endedOn: null } }),
      this.prisma.marriage.count({
        where: { ...where, endedOn: { not: null } },
      }),
    ]);
    return { active, dissolved };
  }

  /** Marriages have no sede: a sede sees those where one of the spouses is one of its members. */
  private visible(scope: TenantScope): Prisma.MarriageWhereInput {
    if (scope.congregationId === null) {
      return { denominationId: scope.denominationId };
    }
    return {
      denominationId: scope.denominationId,
      OR: [
        { spouse1: { member: { congregationId: scope.congregationId } } },
        { spouse2: { member: { congregationId: scope.congregationId } } },
      ],
    };
  }

  private where(
    scope: TenantScope,
    filter: MarriageFilter,
  ): Prisma.MarriageWhereInput {
    const tokens = nameTokens(filter.q ?? '');
    return {
      AND: [
        this.visible(scope),
        ...(filter.status === 'active' ? [{ endedOn: null }] : []),
        ...(filter.status === 'dissolved' ? [{ endedOn: { not: null } }] : []),
        ...(filter.from || filter.to
          ? [
              {
                marriedOn: {
                  ...(filter.from ? { gte: parseIsoDate(filter.from) } : {}),
                  ...(filter.to ? { lte: parseIsoDate(filter.to) } : {}),
                },
              },
            ]
          : []),
        ...tokens.map((token) => ({
          OR: [
            { spouse1: personNameMatches(token) },
            { spouse2: personNameMatches(token) },
          ],
        })),
      ],
    };
  }

  private toRecord(row: MarriageRow): MarriageRecord {
    const today = this.clock.today();
    const registeredWith: MarriageRegistry | null =
      row.registeredWith ??
      (row.isCivil ? 'NOTARY' : row.isChristian ? 'CHURCH' : null);
    return {
      id: row.id,
      code: marriageCode(row.id),
      denominationId: row.denominationId,
      spouse1: toPersonSummary(row.spouse1, today),
      spouse2: toPersonSummary(row.spouse2, today),
      registeredWith,
      marriedOn: toIsoDateOrNull(row.marriedOn),
      place: row.place,
      officiant: row.officiant ? toPersonSummary(row.officiant, today) : null,
      endedOn: toIsoDateOrNull(row.endedOn),
      endReason: row.endReason,
      status: row.endedOn === null ? 'ACTIVE' : 'DISSOLVED',
    };
  }
}
