import { Injectable } from '@nestjs/common';
import type { SessionValidator } from '../../common/security/session-validator.port.js';
import { PrismaService } from './prisma.service.js';

/**
 * A session (the `family` of its refresh tokens) is open while it keeps one refresh token that is
 * neither revoked nor expired. Every rotation inserts the new token in the same transaction that
 * revokes the old one, so a live session always has one. Uses the index on `family`.
 */
@Injectable()
export class PrismaSessionValidator implements SessionValidator {
  constructor(private readonly prisma: PrismaService) {}

  async isActive(
    userId: number,
    sessionId: string,
    now: Date,
  ): Promise<boolean> {
    const open = await this.prisma.refreshToken.count({
      where: {
        family: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      take: 1,
    });
    return open > 0;
  }
}
