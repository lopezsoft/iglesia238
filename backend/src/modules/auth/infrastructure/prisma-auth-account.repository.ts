import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  AuthAccount,
  AuthAccountRepository,
  FailedLoginResult,
} from '../application/ports/auth-account.repository.js';

const ACCOUNT_SELECT = {
  id: true,
  email: true,
  displayName: true,
  passwordHash: true,
  isActive: true,
  emailVerifiedAt: true,
  lockedUntil: true,
} as const;

@Injectable()
export class PrismaAuthAccountRepository implements AuthAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<AuthAccount | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: ACCOUNT_SELECT,
    });
  }

  findById(id: number): Promise<AuthAccount | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: ACCOUNT_SELECT,
    });
  }

  async registerFailedLogin(
    userId: number,
    now: Date,
    policy: { maxAttempts: number; lockMinutes: number },
    transaction?: Transaction,
  ): Promise<FailedLoginResult> {
    const client = clientOf(this.prisma, transaction);
    const { failedLoginAttempts } = await client.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    if (failedLoginAttempts < policy.maxAttempts) {
      return { locked: false, lockedUntil: null };
    }

    const lockedUntil = new Date(now.getTime() + policy.lockMinutes * 60_000);
    await client.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil },
    });
    return { locked: true, lockedUntil };
  }

  async registerSuccessfulLogin(
    userId: number,
    now: Date,
    upgradedPasswordHash: string | null,
    transaction?: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
        ...(upgradedPasswordHash ? { passwordHash: upgradedPasswordHash } : {}),
      },
    });
  }

  async markEmailVerified(
    userId: number,
    verifiedAt: Date,
    transaction?: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: verifiedAt },
    });
  }

  async setPassword(
    userId: number,
    passwordHash: string,
    options: { verifyEmailAt: Date | null },
    transaction?: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).user.update({
      where: { id: userId },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(options.verifyEmailAt
          ? { emailVerifiedAt: options.verifyEmailAt }
          : {}),
      },
    });
  }
}
