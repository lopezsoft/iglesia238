import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { LinkPurpose, UserLinkStore } from '../application/users.ports.js';

/** The invitation is an EMAIL_VERIFICATION token (it verifies the e-mail on acceptance). */
const TOKEN_TYPE = {
  INVITATION: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
} as const satisfies Record<LinkPurpose, string>;

@Injectable()
export class PrismaUserLinkStore implements UserLinkStore {
  constructor(private readonly prisma: PrismaService) {}

  async replaceLink(
    link: {
      userId: number;
      purpose: LinkPurpose;
      tokenHash: string;
      expiresAt: Date;
    },
    now: Date,
    transaction: Transaction,
  ): Promise<void> {
    const client = clientOf(this.prisma, transaction);
    const type = TOKEN_TYPE[link.purpose];
    await client.userToken.updateMany({
      where: { userId: link.userId, type, usedAt: null },
      data: { usedAt: now },
    });
    await client.userToken.create({
      data: {
        userId: link.userId,
        type,
        tokenHash: link.tokenHash,
        expiresAt: link.expiresAt,
      },
    });
  }
}
