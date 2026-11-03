import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  NewUserToken,
  StoredUserToken,
  UserTokenKind,
  UserTokenRepository,
} from '../application/ports/user-token.repository.js';

@Injectable()
export class PrismaUserTokenRepository implements UserTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(token: NewUserToken, transaction?: Transaction): Promise<void> {
    await clientOf(this.prisma, transaction).userToken.create({
      data: {
        userId: token.userId,
        type: token.type,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
      },
    });
  }

  findByHash(
    tokenHash: string,
    type: UserTokenKind,
  ): Promise<StoredUserToken | null> {
    return this.prisma.userToken.findFirst({
      where: { tokenHash, type },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
  }

  async consume(
    id: number,
    now: Date,
    transaction?: Transaction,
  ): Promise<boolean> {
    const { count } = await clientOf(
      this.prisma,
      transaction,
    ).userToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: now },
    });
    return count === 1;
  }

  async invalidatePending(
    userId: number,
    type: UserTokenKind,
    now: Date,
    transaction?: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).userToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: now },
    });
  }
}
