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

  async replacePassword(userId: number, passwordHash: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }
}
