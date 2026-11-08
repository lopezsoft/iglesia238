import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import type {
  BrandingChanges,
  BrandingRecord,
} from '../application/branding.models.js';
import type { BrandingRepository } from '../application/ports/branding.ports.js';

const SELECT = {
  id: true,
  name: true,
  logoPath: true,
  primaryColor: true,
} as const;

function toRecord(row: {
  id: number;
  name: string;
  logoPath: string | null;
  primaryColor: string | null;
}): BrandingRecord {
  return {
    denominationId: row.id,
    denominationName: row.name,
    logoKey: row.logoPath,
    primaryColor: row.primaryColor,
  };
}

@Injectable()
export class PrismaBrandingRepository implements BrandingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(denominationId: number): Promise<BrandingRecord | null> {
    const row = await this.prisma.denomination.findFirst({
      where: { id: denominationId, deletedAt: null },
      select: SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async update(
    denominationId: number,
    changes: BrandingChanges,
    transaction: Transaction,
  ): Promise<BrandingRecord | null> {
    const client = clientOf(this.prisma, transaction);
    const where = { id: denominationId, deletedAt: null };
    const result = await client.denomination.updateMany({
      where,
      data: {
        ...(changes.logoKey !== undefined ? { logoPath: changes.logoKey } : {}),
        ...(changes.primaryColor !== undefined
          ? { primaryColor: changes.primaryColor }
          : {}),
      },
    });
    if (result.count !== 1) {
      return null;
    }
    const row = await client.denomination.findFirst({ where, select: SELECT });
    return row ? toRecord(row) : null;
  }
}
