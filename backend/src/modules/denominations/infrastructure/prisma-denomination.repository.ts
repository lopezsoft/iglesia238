import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { toSkipTake } from '../../../common/pagination/page.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  DenominationCounts,
  DenominationListFilter,
  DenominationRecord,
  DenominationRepository,
} from '../application/denomination.repository.port.js';

const WITH_COUNTS = {
  id: true,
  name: true,
  isActive: true,
  createdAt: true,
  _count: {
    select: {
      legalEntities: { where: { deletedAt: null } },
      congregations: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.DenominationSelect;

type DenominationRow = Prisma.DenominationGetPayload<{
  select: typeof WITH_COUNTS;
}>;

function toRecord(row: DenominationRow): DenominationRecord {
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt,
    legalEntityCount: row._count.legalEntities,
    congregationCount: row._count.congregations,
  };
}

@Injectable()
export class PrismaDenominationRepository implements DenominationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filter: DenominationListFilter,
  ): Promise<{ items: DenominationRecord[]; total: number }> {
    const where: Prisma.DenominationWhereInput = {
      deletedAt: null,
      ...(filter.search !== '' ? { name: { contains: filter.search } } : {}),
      ...(filter.status === 'all'
        ? {}
        : { isActive: filter.status === 'active' }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.denomination.findMany({
        where,
        select: WITH_COUNTS,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...toSkipTake(filter),
      }),
      this.prisma.denomination.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async counts(): Promise<DenominationCounts> {
    const [total, active, congregations] = await Promise.all([
      this.prisma.denomination.count({ where: { deletedAt: null } }),
      this.prisma.denomination.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.congregation.count({
        where: { deletedAt: null, denomination: { deletedAt: null } },
      }),
    ]);
    return { total, active, congregations };
  }

  async findById(id: number): Promise<DenominationRecord | null> {
    const row = await this.prisma.denomination.findFirst({
      where: { id, deletedAt: null },
      select: WITH_COUNTS,
    });
    return row ? toRecord(row) : null;
  }

  listNames(): Promise<{ id: number; name: string }[]> {
    return this.prisma.denomination.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
  }

  async create(name: string, transaction: Transaction): Promise<number> {
    const created = await clientOf(
      this.prisma,
      transaction,
    ).denomination.create({ data: { name }, select: { id: true } });
    return created.id;
  }

  async rename(
    id: number,
    name: string,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).denomination.update({
      where: { id },
      data: { name },
    });
  }

  async setActive(
    id: number,
    isActive: boolean,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).denomination.update({
      where: { id },
      data: { isActive },
    });
  }
}
