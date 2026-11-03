import { PrismaClient } from '../generated/prisma/client.js';
import type { PlatformPasswordStore } from './reset-platform-admin-password.use-case.js';

const PLATFORM_ADMIN_ROLE = 'PLATFORM_ADMIN';

export class PrismaPlatformPasswordStore implements PlatformPasswordStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findPlatformAdminId(email: string): Promise<number | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        isActive: true,
        deletedAt: null,
        roleAssignments: {
          some: { role: { code: PLATFORM_ADMIN_ROLE }, revokedAt: null },
        },
      },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async replacePassword(
    userId: number,
    passwordHash: string,
    verifiedAt: Date,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      // Accounts created before the e-mail confirmation existed must not be locked out by it.
      this.prisma.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: verifiedAt },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }
}
