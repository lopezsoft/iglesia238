import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  NewRefreshToken,
  RefreshTokenRepository,
  StoredRefreshToken,
} from '../application/ports/refresh-token.repository.js';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    token: NewRefreshToken,
    transaction?: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).refreshToken.create({
      data: {
        userId: token.userId,
        family: token.family,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
      },
    });
  }

  findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        family: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  async findFamilyStart(family: string): Promise<Date | null> {
    const oldest = await this.prisma.refreshToken.findFirst({
      where: { family },
      orderBy: { id: 'asc' },
      select: { createdAt: true },
    });
    return oldest?.createdAt ?? null;
  }

  async revokeIfActive(
    id: number,
    now: Date,
    transaction?: Transaction,
  ): Promise<boolean> {
    const { count } = await clientOf(
      this.prisma,
      transaction,
    ).refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now },
    });
    return count === 1;
  }

  async revokeFamily(
    family: string,
    now: Date,
    transaction?: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).refreshToken.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeAllOfUser(
    userId: number,
    now: Date,
    exceptFamily: string | null,
    transaction?: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptFamily ? { family: { not: exceptFamily } } : {}),
      },
      data: { revokedAt: now },
    });
  }
}
