import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  GrantScopeReader,
  ScopeCongregation,
  ScopeDenomination,
} from '../application/users.ports.js';

const ACTIVE_DENOMINATION = { isActive: true, deletedAt: null } as const;

@Injectable()
export class PrismaGrantScopeReader implements GrantScopeReader {
  constructor(private readonly prisma: PrismaService) {}

  findActiveDenomination(id: number): Promise<ScopeDenomination | null> {
    return this.prisma.denomination.findFirst({
      where: { id, ...ACTIVE_DENOMINATION },
      select: { id: true, name: true },
    });
  }

  async findActiveCongregation(id: number): Promise<ScopeCongregation | null> {
    const row = await this.prisma.congregation.findFirst({
      where: {
        id,
        isActive: true,
        deletedAt: null,
        denomination: ACTIVE_DENOMINATION,
      },
      select: {
        id: true,
        name: true,
        denominationId: true,
        denomination: { select: { name: true } },
      },
    });
    return row
      ? {
          id: row.id,
          name: row.name,
          denominationId: row.denominationId,
          denominationName: row.denomination.name,
        }
      : null;
  }

  listActiveDenominations(): Promise<ScopeDenomination[]> {
    return this.prisma.denomination.findMany({
      where: ACTIVE_DENOMINATION,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async listActiveCongregations(
    denominationId: number | null,
  ): Promise<ScopeCongregation[]> {
    const rows = await this.prisma.congregation.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        denomination: ACTIVE_DENOMINATION,
        ...(denominationId === null ? {} : { denominationId }),
      },
      select: {
        id: true,
        name: true,
        denominationId: true,
        denomination: { select: { name: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      denominationId: row.denominationId,
      denominationName: row.denomination.name,
    }));
  }

  async findDenominationName(id: number): Promise<string | null> {
    const row = await this.prisma.denomination.findFirst({
      where: { id, deletedAt: null },
      select: { name: true },
    });
    return row?.name ?? null;
  }
}
