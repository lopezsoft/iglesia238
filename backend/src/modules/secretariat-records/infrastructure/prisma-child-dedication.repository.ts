import { Injectable } from '@nestjs/common';
import {
  toIsoDate,
  parseIsoDate,
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
  ChildDedicationRepository,
  NewChildDedication,
} from '../application/ports/records.ports.js';
import type {
  ChildDedicationRecord,
  DedicationFilter,
  ParentReference,
  ParentRole,
} from '../application/records.models.js';
import {
  nameTokens,
  personNameMatches,
  personSummarySelect,
  toParentReference,
  toPersonSummary,
} from './person-summary.js';

const dedicationInclude = {
  congregation: { select: { name: true } },
  pastor: { select: personSummarySelect },
  child: {
    select: {
      ...personSummarySelect,
      // The parents of a child are the relatives that point FROM the child (schema: FamilyRelation).
      familyRelations: {
        where: { type: { in: ['FATHER', 'MOTHER', 'GUARDIAN'] } },
        orderBy: { id: 'asc' },
        select: { type: true, relative: { select: personSummarySelect } },
      },
    },
  },
} satisfies Prisma.ChildDedicationInclude;

type DedicationRow = Prisma.ChildDedicationGetPayload<{
  include: typeof dedicationInclude;
}>;

@Injectable()
export class PrismaChildDedicationRepository implements ChildDedicationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(
    scope: TenantScope,
    filter: DedicationFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<ChildDedicationRecord>> {
    const where = this.where(scope, filter);
    const [rows, total] = await Promise.all([
      this.prisma.childDedication.findMany({
        where,
        include: dedicationInclude,
        orderBy: [{ dedicatedOn: 'desc' }, { id: 'desc' }],
        ...toSkipTake(page),
      }),
      this.prisma.childDedication.count({ where }),
    ]);
    return buildPage(
      rows.map((row) => this.toRecord(row)),
      total,
      page,
    );
  }

  async find(
    scope: TenantScope,
    id: number,
  ): Promise<ChildDedicationRecord | null> {
    const row = await this.prisma.childDedication.findFirst({
      where: { id, ...scope.where() },
      include: dedicationInclude,
    });
    return row ? this.toRecord(row) : null;
  }

  async existsForChild(
    scope: TenantScope,
    childId: number,
    transaction?: Transaction,
  ): Promise<boolean> {
    const count = await clientOf(
      this.prisma,
      transaction,
    ).childDedication.count({
      where: { denominationId: scope.denominationId, childId },
    });
    return count > 0;
  }

  async create(
    scope: TenantScope,
    data: NewChildDedication,
    transaction: Transaction,
  ): Promise<ChildDedicationRecord> {
    const client = clientOf(this.prisma, transaction);
    const created = await client.childDedication.create({
      data: {
        denominationId: scope.denominationId,
        congregationId: data.congregationId,
        childId: data.childId,
        pastorId: data.pastorId,
        dedicatedOn: parseIsoDate(data.dedicatedOn),
      },
      select: { id: true },
    });
    for (const parent of data.parents) {
      await client.familyRelation.upsert({
        where: {
          personId_relativeId_type: {
            personId: data.childId,
            relativeId: parent.personId,
            type: parent.role,
          },
        },
        create: {
          denominationId: scope.denominationId,
          personId: data.childId,
          relativeId: parent.personId,
          type: parent.role,
        },
        update: {},
      });
    }
    const row = await client.childDedication.findFirstOrThrow({
      where: { id: created.id, ...scope.where() },
      include: dedicationInclude,
    });
    return this.toRecord(row);
  }

  async counts(
    scope: TenantScope,
    year: number,
  ): Promise<{ total: number; thisYear: number }> {
    const [total, thisYear] = await Promise.all([
      this.prisma.childDedication.count({ where: scope.where() }),
      this.prisma.childDedication.count({
        where: {
          ...scope.where(),
          dedicatedOn: {
            gte: parseIsoDate(`${year}-01-01`),
            lte: parseIsoDate(`${year}-12-31`),
          },
        },
      }),
    ]);
    return { total, thisYear };
  }

  private where(
    scope: TenantScope,
    filter: DedicationFilter,
  ): Prisma.ChildDedicationWhereInput {
    const tokens = nameTokens(filter.q ?? '');
    return {
      ...scope.where(),
      ...(filter.from || filter.to
        ? {
            dedicatedOn: {
              ...(filter.from ? { gte: parseIsoDate(filter.from) } : {}),
              ...(filter.to ? { lte: parseIsoDate(filter.to) } : {}),
            },
          }
        : {}),
      ...(tokens.length > 0
        ? { child: { AND: tokens.map((token) => personNameMatches(token)) } }
        : {}),
    };
  }

  private toRecord(row: DedicationRow): ChildDedicationRecord {
    const today = this.clock.today();
    const parentOf = (role: ParentRole): ParentReference | null => {
      const relation = row.child.familyRelations.find(
        (item) => item.type === role,
      );
      return relation
        ? toParentReference(toPersonSummary(relation.relative, today))
        : null;
    };
    return {
      id: row.id,
      denominationId: row.denominationId,
      congregationId: row.congregationId,
      congregationName: row.congregation.name,
      dedicatedOn: toIsoDate(row.dedicatedOn),
      child: toPersonSummary(row.child, today),
      pastor: row.pastor ? toPersonSummary(row.pastor, today) : null,
      father: parentOf('FATHER'),
      mother: parentOf('MOTHER'),
      guardian: parentOf('GUARDIAN'),
    };
  }
}
