import { Injectable } from '@nestjs/common';
import {
  Transaction,
  TransactionRunner,
} from '../../common/persistence/transaction.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

const MAX_WAIT_MS = 5_000;
const TIMEOUT_MS = 20_000;

/** Prisma side of the opaque Transaction handle. */
export class PrismaTransaction implements Transaction {
  readonly kind = 'transaction' as const;

  constructor(readonly client: Prisma.TransactionClient) {}
}

/**
 * The client a repository must use: the open transaction when there is one, the service otherwise.
 * It keeps repositories usable both alone and inside a use case that coordinates several of them.
 */
export function clientOf(
  prisma: PrismaService,
  transaction?: Transaction,
): Prisma.TransactionClient {
  if (transaction === undefined) {
    return prisma;
  }
  if (!(transaction instanceof PrismaTransaction)) {
    throw new Error('Unsupported transaction handle');
  }
  return transaction.client;
}

@Injectable()
export class PrismaTransactionRunner implements TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      (client) => work(new PrismaTransaction(client)),
      { maxWait: MAX_WAIT_MS, timeout: TIMEOUT_MS },
    );
  }
}
