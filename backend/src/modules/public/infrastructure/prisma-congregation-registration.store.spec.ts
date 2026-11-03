import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaTransaction } from '../../../infrastructure/prisma/prisma-transaction.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  DuplicateRegistrationEmailError,
  type RegistrationCommand,
} from '../application/ports/congregation-registration.store.js';
import { PrismaCongregationRegistrationStore } from './prisma-congregation-registration.store.js';

const COMMAND: RegistrationCommand = {
  congregation: {
    denominationId: 1,
    legalEntityId: 12,
    name: 'Sede Norte',
    code: 'SN',
    municipalityId: 3,
    address: null,
    phone: null,
    email: null,
  },
  manager: {
    email: 'laura@iglesia.org',
    displayName: 'Laura Gómez',
    passwordHash: 'scrypt$hash',
  },
  roleCodes: ['PASTOR', 'SECRETARY', 'TREASURER'],
  verification: {
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date('2026-11-05T15:00:00.000Z'),
  },
};

type Call = [{ data: Record<string, unknown> }];

/** The `data` argument of every call of a Prisma `create` mock. */
function dataOf(mock: { mock: { calls: unknown[][] } }) {
  return (mock.mock.calls as Call[]).map(([arg]) => arg.data);
}

function clientWith(overrides: Record<string, unknown> = {}) {
  let roleId = 0;
  const client = {
    user: { create: vi.fn().mockResolvedValue({ id: 50 }) },
    congregation: { create: vi.fn().mockResolvedValue({ id: 70 }) },
    role: {
      findMany: vi.fn().mockResolvedValue([
        { id: 3, code: 'TREASURER' },
        { id: 1, code: 'PASTOR' },
        { id: 2, code: 'SECRETARY' },
      ]),
    },
    userRole: {
      create: vi.fn().mockImplementation(() => {
        roleId += 1;
        return Promise.resolve({ id: 900 + roleId });
      }),
    },
    userToken: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
  const transaction = new PrismaTransaction(
    client as unknown as Prisma.TransactionClient,
  );
  const store = new PrismaCongregationRegistrationStore(
    {} as unknown as PrismaService,
  );
  return { client, transaction, store };
}

describe('PrismaCongregationRegistrationStore.register', () => {
  it('creates an unverified user, an active congregation that accepts applications, and the congregation-scope roles', async () => {
    const { client, transaction, store } = clientWith();

    const result = await store.register(COMMAND, transaction);

    expect(dataOf(client.user.create)[0]).toEqual({
      email: 'laura@iglesia.org',
      displayName: 'Laura Gómez',
      passwordHash: 'scrypt$hash',
      emailVerifiedAt: null,
    });
    expect(dataOf(client.congregation.create)[0]).toMatchObject({
      denominationId: 1,
      legalEntityId: 12,
      code: 'SN',
      isActive: true,
      acceptsApplications: true,
    });
    // CHECK chk_user_roles_scope: scope CONGREGATION needs both ids and scope_key C:<id>.
    const grants = dataOf(client.userRole.create);
    expect(grants).toEqual([
      {
        userId: 50,
        roleId: 1,
        scope: 'CONGREGATION',
        denominationId: 1,
        congregationId: 70,
        scopeKey: 'C:70',
        grantedById: null,
      },
      expect.objectContaining({ roleId: 2, scopeKey: 'C:70' }),
      expect.objectContaining({ roleId: 3, scopeKey: 'C:70' }),
    ]);
    expect(grants.every((grant) => !('activeKey' in grant))).toBe(true);
    expect(dataOf(client.userToken.create)[0]).toEqual({
      userId: 50,
      type: 'EMAIL_VERIFICATION',
      tokenHash: 'a'.repeat(64),
      expiresAt: COMMAND.verification.expiresAt,
    });
    expect(result).toEqual({
      congregationId: 70,
      userId: 50,
      assignments: [
        { id: 901, roleCode: 'PASTOR' },
        { id: 902, roleCode: 'SECRETARY' },
        { id: 903, roleCode: 'TREASURER' },
      ],
    });
  });

  it('reports a taken e-mail as a domain error and writes nothing else', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { client, transaction, store } = clientWith({
      user: { create: vi.fn().mockRejectedValue(duplicate) },
    });

    await expect(store.register(COMMAND, transaction)).rejects.toBeInstanceOf(
      DuplicateRegistrationEmailError,
    );
    expect(client.congregation.create).not.toHaveBeenCalled();
    expect(client.userRole.create).not.toHaveBeenCalled();
  });

  it('lets any other database error through (it rolls the transaction back)', async () => {
    const { transaction, store } = clientWith({
      congregation: { create: vi.fn().mockRejectedValue(new Error('boom')) },
    });

    await expect(store.register(COMMAND, transaction)).rejects.toThrow('boom');
  });

  it('fails loudly when the role catalog was not seeded', async () => {
    const { client, transaction, store } = clientWith({
      role: { findMany: vi.fn().mockResolvedValue([]) },
    });

    await expect(store.register(COMMAND, transaction)).rejects.toThrow(
      'Role catalog is incomplete',
    );
    expect(client.userToken.create).not.toHaveBeenCalled();
  });
});

describe('PrismaCongregationRegistrationStore reads', () => {
  it('offers only active legal entities of active denominations and active countries', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const store = new PrismaCongregationRegistrationStore({
      legalEntity: { findFirst },
    } as unknown as PrismaService);

    await store.findActiveLegalEntity(12);

    expect((findFirst.mock.calls[0][0] as { where: unknown }).where).toEqual({
      id: 12,
      isActive: true,
      deletedAt: null,
      denomination: { isActive: true, deletedAt: null },
      country: { isActive: true },
    });
  });

  it('resolves the municipality by its code inside the country, never by the code alone', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 5 });
    const store = new PrismaCongregationRegistrationStore({
      municipality: { findFirst },
    } as unknown as PrismaService);

    await expect(store.findMunicipalityId(48, '13001')).resolves.toBe(5);
    expect((findFirst.mock.calls[0][0] as { where: unknown }).where).toEqual({
      code: '13001',
      region: { countryId: 48 },
    });
  });

  it('checks the e-mail against every account, deleted or not', async () => {
    const count = vi.fn().mockResolvedValue(1);
    const store = new PrismaCongregationRegistrationStore({
      user: { count },
    } as unknown as PrismaService);

    await expect(store.emailExists('laura@iglesia.org')).resolves.toBe(true);
    expect(count).toHaveBeenCalledWith({
      where: { email: 'laura@iglesia.org' },
    });
  });
});
