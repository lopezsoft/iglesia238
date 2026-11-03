import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  CongregationDirectory,
  PeopleDirectory,
} from '../application/ports/records.ports.js';
import type {
  NamedOption,
  PersonSummary,
} from '../application/records.models.js';
import { personSummarySelect, toPersonSummary } from './person-summary.js';

@Injectable()
export class PrismaCongregationDirectory implements CongregationDirectory {
  constructor(private readonly prisma: PrismaService) {}

  listActive(scope: TenantScope): Promise<NamedOption[]> {
    return this.prisma.congregation.findMany({
      where: {
        denominationId: scope.denominationId,
        isActive: true,
        deletedAt: null,
        ...(scope.congregationId === null ? {} : { id: scope.congregationId }),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async findActive(
    scope: TenantScope,
    id: number,
  ): Promise<NamedOption | null> {
    if (scope.congregationId !== null && scope.congregationId !== id) {
      return null;
    }
    return this.prisma.congregation.findFirst({
      where: {
        id,
        denominationId: scope.denominationId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });
  }
}

@Injectable()
export class PrismaPeopleDirectory implements PeopleDirectory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async findByIds(
    scope: TenantScope,
    ids: readonly number[],
  ): Promise<PersonSummary[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.person.findMany({
      where: {
        denominationId: scope.denominationId,
        id: { in: [...ids] },
        deletedAt: null,
      },
      select: personSummarySelect,
    });
    const today = this.clock.today();
    return rows.map((row) => toPersonSummary(row, today));
  }

  async createNameOnly(
    scope: TenantScope,
    fullName: string,
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(this.prisma, transaction).person.create({
      data: { denominationId: scope.denominationId, fullName },
      select: { id: true },
    });
    return created.id;
  }

  async lock(
    scope: TenantScope,
    ids: readonly number[],
    transaction: Transaction,
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await clientOf(this.prisma, transaction).$queryRaw`
      SELECT id FROM persons
      WHERE denomination_id = ${scope.denominationId} AND id IN (${Prisma.join([...ids])})
      ORDER BY id
      FOR UPDATE`;
  }
}
