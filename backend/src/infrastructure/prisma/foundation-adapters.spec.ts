import { TenantScope } from '../../common/tenancy/tenant-scope.js';
import { Transaction } from '../../common/persistence/transaction.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaAssignmentsReader } from './prisma-assignments.reader.js';
import { PrismaAuditRecorder } from './prisma-audit-recorder.js';
import { PrismaDocumentSequenceStore } from './prisma-document-sequence.store.js';
import { PrismaSessionValidator } from './prisma-session-validator.js';
import {
  PrismaTransaction,
  PrismaTransactionRunner,
  clientOf,
} from './prisma-transaction.js';
import { PrismaService } from './prisma.service.js';

const asService = (fake: object) => fake as unknown as PrismaService;
const asClient = (fake: object) => fake as unknown as Prisma.TransactionClient;

describe('PrismaAssignmentsReader', () => {
  it('maps active assignments with the permissions of each role', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 5,
      isActive: true,
      roleAssignments: [
        {
          scope: 'CONGREGATION',
          scopeKey: 'C:10',
          denominationId: 1,
          congregationId: 10,
          role: {
            code: 'TREASURER',
            rolePermissions: [
              { permission: { code: 'contributions.read' } },
              { permission: { code: 'contributions.write' } },
            ],
          },
        },
      ],
    });
    const reader = new PrismaAssignmentsReader(
      asService({ user: { findFirst } }),
    );

    const access = await reader.loadAccess(5);

    expect(access).toEqual({
      userId: 5,
      isActive: true,
      assignments: [
        {
          roleCode: 'TREASURER',
          kind: 'CONGREGATION',
          scopeKey: 'C:10',
          denominationId: 1,
          congregationId: 10,
          permissions: ['contributions.read', 'contributions.write'],
        },
      ],
    });
  });

  it('asks only for non-deleted users and for non-revoked roles of active denominations and congregations', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const reader = new PrismaAssignmentsReader(
      asService({ user: { findFirst } }),
    );

    await expect(reader.loadAccess(5)).resolves.toBeNull();

    const args = findFirst.mock.calls[0][0] as {
      where: object;
      select: { roleAssignments: { where: object } };
    };
    expect(args.where).toEqual({ id: 5, deletedAt: null });
    expect(args.select.roleAssignments.where).toEqual({
      revokedAt: null,
      AND: [
        // The roles of a deactivated denomination stop working at once...
        {
          OR: [
            { denominationId: null },
            { denomination: { isActive: true, deletedAt: null } },
          ],
        },
        // ...and so do those of a deactivated or deleted congregation.
        {
          OR: [
            { congregationId: null },
            { congregation: { isActive: true, deletedAt: null } },
          ],
        },
      ],
    });
  });

  it('reads the denomination of a congregation from the database', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ denominationId: 3 })
      .mockResolvedValueOnce(null);
    const reader = new PrismaAssignmentsReader(
      asService({ congregation: { findFirst } }),
    );

    await expect(reader.findCongregationDenominationId(8)).resolves.toBe(3);
    await expect(reader.findCongregationDenominationId(9)).resolves.toBeNull();
    // A deactivated congregation (or one of a deactivated denomination) is not reachable either.
    expect(findFirst.mock.calls[0][0]).toMatchObject({
      where: {
        id: 8,
        isActive: true,
        deletedAt: null,
        denomination: { isActive: true, deletedAt: null },
      },
    });
  });
});

describe('PrismaSessionValidator', () => {
  const now = new Date('2026-11-02T15:00:00.000Z');

  it('is open while the session keeps a refresh token that is neither revoked nor expired', async () => {
    const count = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const validator = new PrismaSessionValidator(
      asService({ refreshToken: { count } }),
    );

    await expect(validator.isActive(5, 'sid', now)).resolves.toBe(true);
    await expect(validator.isActive(5, 'sid', now)).resolves.toBe(false);

    expect(count.mock.calls[0][0]).toEqual({
      where: {
        family: 'sid',
        userId: 5,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      take: 1,
    });
  });
});

describe('PrismaTransactionRunner and clientOf', () => {
  it('runs the work with a Prisma transaction handle', async () => {
    const client = asClient({ marker: true });
    const $transaction = vi.fn(
      (work: (c: Prisma.TransactionClient) => unknown) =>
        Promise.resolve(work(client)),
    );
    const runner = new PrismaTransactionRunner(asService({ $transaction }));

    const received = await runner.run((tx) => Promise.resolve(tx));

    expect(received).toBeInstanceOf(PrismaTransaction);
    expect(clientOf(asService({}), received)).toBe(client);
  });

  it('uses the service itself when there is no transaction', () => {
    const service = asService({ marker: 'service' });

    expect(clientOf(service)).toBe(service);
  });

  it('rejects a handle from another implementation', () => {
    const foreign: Transaction = { kind: 'transaction' };

    expect(() => clientOf(asService({}), foreign)).toThrow(
      'Unsupported transaction',
    );
  });
});

describe('PrismaAuditRecorder', () => {
  const actor = { userId: 7, denominationId: 1, congregationId: 10 };

  it('writes the entry with the actor tenant and a string entity id', async () => {
    const create = vi.fn().mockResolvedValue({});
    const recorder = new PrismaAuditRecorder(
      asService({ auditLog: { create } }),
    );

    await recorder.record({
      action: 'UPDATED',
      entity: 'Congregation',
      entityId: 99,
      actor,
      changes: { isActive: { from: true, to: false } },
      ipAddress: '10.0.0.1',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 7,
        denominationId: 1,
        congregationId: 10,
        entity: 'Congregation',
        entityId: '99',
        action: 'UPDATED',
        changes: { isActive: { from: true, to: false } },
        ipAddress: '10.0.0.1',
      },
    });
  });

  it('lets the entry name the tenant it belongs to (platform acting on a denomination)', async () => {
    const create = vi.fn().mockResolvedValue({});
    const recorder = new PrismaAuditRecorder(
      asService({ auditLog: { create } }),
    );

    await recorder.record({
      action: 'CREATED',
      entity: 'Denomination',
      entityId: 4,
      actor: { userId: 1, denominationId: null, congregationId: null },
      denominationId: 4,
    });

    const [call] = create.mock.calls as [[{ data: object }]];
    expect(call[0].data).toMatchObject({
      denominationId: 4,
      congregationId: null,
      ipAddress: null,
    });
  });

  it('writes through the transaction it is given, so it commits with the change', async () => {
    const service = asService({ auditLog: { create: vi.fn() } });
    const txCreate = vi.fn().mockResolvedValue({});
    const tx = new PrismaTransaction(
      asClient({ auditLog: { create: txCreate } }),
    );

    await new PrismaAuditRecorder(service).record(
      { action: 'CREATED', entity: 'Fund', entityId: 1, actor },
      tx,
    );

    expect(txCreate).toHaveBeenCalledOnce();
    expect(
      (service as unknown as { auditLog: { create: ReturnType<typeof vi.fn> } })
        .auditLog.create,
    ).not.toHaveBeenCalled();
  });
});

describe('PrismaDocumentSequenceStore', () => {
  const scope = TenantScope.of(1, 10);

  function storeWith(client: object) {
    const tx = new PrismaTransaction(asClient(client));
    return { store: new PrismaDocumentSequenceStore(asService({})), tx };
  }

  const notFound = () =>
    new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: 'test',
    });
  const duplicate = () =>
    new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });

  it('increments an existing counter, scoped by denomination and congregation', async () => {
    const update = vi.fn().mockResolvedValue({ lastValue: 8 });
    const { store, tx } = storeWith({ documentSequence: { update } });

    await expect(store.next(scope, 'MEMBER', tx)).resolves.toBe(8);

    expect(update).toHaveBeenCalledWith({
      where: {
        congregationId_key: { congregationId: 10, key: 'MEMBER' },
        denominationId: 1,
      },
      data: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    });
  });

  it('creates the counter with 1 the first time', async () => {
    const update = vi.fn(() => Promise.reject(notFound()));
    const create = vi.fn().mockResolvedValue({});
    const { store, tx } = storeWith({ documentSequence: { update, create } });

    await expect(store.next(scope, 'VOUCHER:REC', tx)).resolves.toBe(1);

    expect(create).toHaveBeenCalledWith({
      data: {
        denominationId: 1,
        congregationId: 10,
        key: 'VOUCHER:REC',
        lastValue: 1,
      },
    });
  });

  it('retries the update when another transaction created the counter first', async () => {
    const update = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(notFound()))
      .mockResolvedValueOnce({ lastValue: 2 });
    const create = vi.fn(() => Promise.reject(duplicate()));
    const { store, tx } = storeWith({ documentSequence: { update, create } });

    await expect(store.next(scope, 'MEMBER', tx)).resolves.toBe(2);
  });

  it('does not hide other database errors', async () => {
    const update = vi.fn(() => Promise.reject(new Error('connection lost')));
    const { store, tx } = storeWith({ documentSequence: { update } });

    await expect(store.next(scope, 'MEMBER', tx)).rejects.toThrow(
      'connection lost',
    );
  });

  it('refuses a scope without congregation', async () => {
    const { store, tx } = storeWith({ documentSequence: {} });

    await expect(store.next(TenantScope.of(1), 'MEMBER', tx)).rejects.toThrow(
      'congregation scope',
    );
  });
});
