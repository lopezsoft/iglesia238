import { Injectable } from '@nestjs/common';
import { DocumentSequenceStore } from '../../common/numbering/document-sequence.store.js';
import { Transaction } from '../../common/persistence/transaction.js';
import { TenantScope } from '../../common/tenancy/tenant-scope.js';
import { Prisma } from '../../generated/prisma/client.js';
import { clientOf } from './prisma-transaction.js';
import { PrismaService } from './prisma.service.js';

const MAX_ATTEMPTS = 3;

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

@Injectable()
export class PrismaDocumentSequenceStore implements DocumentSequenceStore {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * UPDATE ... SET last_value = last_value + 1 takes the row lock, so concurrent callers queue behind
   * the open transaction and each one reads its own value. The first number of a key creates the row;
   * two callers racing to create it collide on the primary key and the loser retries the update.
   */
  async next(
    scope: TenantScope,
    key: string,
    transaction: Transaction,
  ): Promise<number> {
    const client = clientOf(this.prisma, transaction);
    const congregationId = scope.requireCongregationId();
    const { denominationId } = scope;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const updated = await client.documentSequence.update({
          where: {
            congregationId_key: { congregationId, key },
            denominationId,
          },
          data: { lastValue: { increment: 1 } },
          select: { lastValue: true },
        });
        return updated.lastValue;
      } catch (error) {
        if (!isPrismaError(error, 'P2025')) {
          throw error;
        }
      }

      try {
        await client.documentSequence.create({
          data: { denominationId, congregationId, key, lastValue: 1 },
        });
        return 1;
      } catch (error) {
        if (!isPrismaError(error, 'P2002')) {
          throw error;
        }
      }
    }
    throw new Error('Could not allocate a document number');
  }
}
