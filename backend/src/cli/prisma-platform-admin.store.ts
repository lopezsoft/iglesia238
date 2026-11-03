import { PrismaClient } from '../generated/prisma/client.js';
import type {
  NewPlatformAdmin,
  PlatformAdminStore,
} from './create-platform-admin.use-case.js';

const PLATFORM_ADMIN_ROLE = 'PLATFORM_ADMIN';
const PLATFORM_SCOPE_KEY = 'P';

export class PrismaPlatformAdminStore implements PlatformAdminStore {
  constructor(private readonly prisma: PrismaClient) {}

  async hasActivePlatformAdmin(): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: { role: { code: PLATFORM_ADMIN_ROLE }, revokedAt: null },
    });
    return count > 0;
  }

  async emailExists(email: string): Promise<boolean> {
    const count = await this.prisma.user.count({ where: { email } });
    return count > 0;
  }

  create(admin: NewPlatformAdmin): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { code: PLATFORM_ADMIN_ROLE },
        select: { id: true },
      });
      if (!role) {
        throw new Error(
          'The PLATFORM_ADMIN role does not exist. Run the seed first (npm run prisma:seed).',
        );
      }

      const user = await tx.user.create({
        data: {
          email: admin.email,
          passwordHash: admin.passwordHash,
          displayName: admin.displayName,
          emailVerifiedAt: admin.emailVerifiedAt,
        },
        select: { id: true },
      });
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          scope: 'PLATFORM',
          scopeKey: PLATFORM_SCOPE_KEY,
          denominationId: null,
          congregationId: null,
        },
      });
      return user.id;
    });
  }
}
