import { Injectable } from '@nestjs/common';
import {
  parseIsoDate,
  toIsoDate,
  toIsoDateOrNull,
} from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { PastoralTermRepository } from '../application/ports/records.ports.js';
import type {
  PastoralTermFilter,
  PastoralTermRecord,
  TermPeriod,
} from '../application/records.models.js';
import { personSummarySelect, toPersonSummary } from './person-summary.js';

const termInclude = {
  congregation: { select: { name: true } },
  pastor: { select: personSummarySelect },
} satisfies Prisma.PastoralTermInclude;

type TermRow = Prisma.PastoralTermGetPayload<{ include: typeof termInclude }>;

@Injectable()
export class PrismaPastoralTermRepository implements PastoralTermRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(
    scope: TenantScope,
    filter: PastoralTermFilter,
  ): Promise<PastoralTermRecord[]> {
    const rows = await this.prisma.pastoralTerm.findMany({
      where: {
        ...scope.where(),
        ...(filter.currentOnly ? { endedOn: null } : {}),
      },
      include: termInclude,
      orderBy: [
        { congregationId: 'asc' },
        { startedOn: 'desc' },
        { id: 'desc' },
      ],
    });
    return rows.map((row) => this.toRecord(row));
  }

  async find(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<PastoralTermRecord | null> {
    const row = await clientOf(this.prisma, transaction).pastoralTerm.findFirst(
      {
        where: { id, ...scope.where() },
        include: termInclude,
      },
    );
    return row ? this.toRecord(row) : null;
  }

  async lockCongregation(
    scope: TenantScope,
    congregationId: number,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).$queryRaw`
      SELECT id FROM congregations
      WHERE denomination_id = ${scope.denominationId} AND id = ${congregationId}
      FOR UPDATE`;
  }

  async periodsOf(
    scope: TenantScope,
    congregationId: number,
    transaction: Transaction,
  ): Promise<TermPeriod[]> {
    const rows = await clientOf(this.prisma, transaction).pastoralTerm.findMany(
      {
        where: { denominationId: scope.denominationId, congregationId },
        select: { id: true, startedOn: true, endedOn: true },
      },
    );
    return rows.map((row) => ({
      id: row.id,
      startedOn: toIsoDate(row.startedOn),
      endedOn: toIsoDateOrNull(row.endedOn),
    }));
  }

  async create(
    scope: TenantScope,
    data: {
      congregationId: number;
      pastorId: number;
      startedOn: string;
      endedOn: string | null;
    },
    transaction: Transaction,
  ): Promise<PastoralTermRecord> {
    const row = await clientOf(this.prisma, transaction).pastoralTerm.create({
      data: {
        denominationId: scope.denominationId,
        congregationId: data.congregationId,
        pastorId: data.pastorId,
        startedOn: parseIsoDate(data.startedOn),
        endedOn: data.endedOn === null ? null : parseIsoDate(data.endedOn),
      },
      include: termInclude,
    });
    return this.toRecord(row);
  }

  async setEndDate(
    scope: TenantScope,
    id: number,
    endedOn: string,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).pastoralTerm.updateMany({
      where: { id, ...scope.where() },
      data: { endedOn: parseIsoDate(endedOn) },
    });
  }

  private toRecord(row: TermRow): PastoralTermRecord {
    return {
      id: row.id,
      denominationId: row.denominationId,
      congregationId: row.congregationId,
      congregationName: row.congregation.name,
      pastor: toPersonSummary(row.pastor, this.clock.today()),
      startedOn: toIsoDate(row.startedOn),
      endedOn: toIsoDateOrNull(row.endedOn),
    };
  }
}
