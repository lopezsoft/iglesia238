import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { CSV_BOM } from '../src/common/export/csv-document.js';
import { AUDIT_RECORDER } from '../src/common/audit/audit-recorder.port.js';
import { DOCUMENT_SEQUENCE_STORE } from '../src/common/numbering/document-sequence.store.js';
import { TRANSACTION_RUNNER } from '../src/common/persistence/transaction.js';
import { AccessTokenService } from '../src/common/security/access-token.service.js';
import { SESSION_VALIDATOR } from '../src/common/security/session-validator.port.js';
import {
  ASSIGNMENTS_READER,
  AssignmentsReader,
  RoleAssignmentView,
  UserAccess,
} from '../src/common/tenancy/assignments-reader.port.js';
import { Clock } from '../src/common/time/bogota-time.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { CONTRIBUTIONS_REPOSITORY } from '../src/modules/contributions/application/contributions.repository.js';
import { CONTRIBUTOR_SEARCH } from '../src/modules/contributions/application/search-contributors.use-case.js';
import {
  FakeAuditRecorder,
  FakeContributionsRepository,
  FakeContributorsRepository,
  FakeVowsRepository,
  FixedClock,
} from '../src/modules/contributions/testing/accounting-world.js';
import {
  PERSON,
  TYPE,
  buildWorld,
} from '../src/modules/contributions/testing/world-fixtures.js';
import { VOWS_REPOSITORY } from '../src/modules/vows/application/vows.repository.js';

const assignment = (
  roleCode: string,
  scopeKey: string,
  denominationId: number,
  congregationId: number | null,
  permissions: string[],
): RoleAssignmentView => ({
  roleCode,
  kind: congregationId === null ? 'DENOMINATION' : 'CONGREGATION',
  scopeKey,
  denominationId,
  congregationId,
  permissions,
});

const TREASURER = 1;
const PASTOR = 2;
const SECRETARY = 3;
const OTHER_TREASURER = 4;
const NORTH_TREASURER = 5;

const accessByUser = new Map<number, UserAccess>([
  [
    TREASURER,
    {
      userId: TREASURER,
      isActive: true,
      assignments: [
        assignment('TREASURER', 'C:10', 1, 10, [
          'contributions.read',
          'contributions.write',
        ]),
      ],
    },
  ],
  [
    PASTOR,
    {
      userId: PASTOR,
      isActive: true,
      assignments: [
        assignment('PASTOR', 'C:10', 1, 10, ['contributions.read']),
      ],
    },
  ],
  [
    SECRETARY,
    {
      userId: SECRETARY,
      isActive: true,
      assignments: [
        assignment('SECRETARY', 'C:10', 1, 10, [
          'members.read',
          'members.write',
        ]),
      ],
    },
  ],
  [
    OTHER_TREASURER,
    {
      userId: OTHER_TREASURER,
      isActive: true,
      assignments: [
        assignment('TREASURER', 'C:20', 2, 20, [
          'contributions.read',
          'contributions.write',
        ]),
      ],
    },
  ],
  [
    NORTH_TREASURER,
    {
      userId: NORTH_TREASURER,
      isActive: true,
      assignments: [
        assignment('TREASURER', 'C:11', 1, 11, [
          'contributions.read',
          'contributions.write',
        ]),
      ],
    },
  ],
]);

const reader: AssignmentsReader = {
  loadAccess: (userId) => Promise.resolve(accessByUser.get(userId) ?? null),
  findCongregationDenominationId: (id) =>
    Promise.resolve(id === 10 || id === 11 ? 1 : id === 20 ? 2 : null),
};

describe('Contributions and vows over HTTP', () => {
  let app: NestFastifyApplication;
  let tokens: AccessTokenService;
  const world = buildWorld();
  const audit = new FakeAuditRecorder();

  const call = async (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    options: { user?: number; scope?: string; body?: object } = {},
  ) =>
    app.inject({
      method,
      url,
      headers: {
        ...(options.user === undefined
          ? {}
          : {
              authorization: `Bearer ${(await tokens.sign({ userId: options.user, sessionId: 's' })).token}`,
            }),
        ...(options.scope === undefined ? {} : { 'x-scope': options.scope }),
      },
      ...(options.body ? { payload: options.body } : {}),
    });

  const asTreasurer = (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    body?: object,
  ) => call(method, url, { user: TREASURER, scope: 'C:10', body });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn() })
      .overrideProvider(RedisService)
      .useValue({ client: { ping: vi.fn() } })
      .overrideProvider(SESSION_VALIDATOR)
      .useValue({
        isActive: () => Promise.resolve(true),
        isEmailVerified: () => Promise.resolve(true),
      })
      .overrideProvider(ASSIGNMENTS_READER)
      .useValue(reader)
      .overrideProvider(CONTRIBUTIONS_REPOSITORY)
      .useValue(new FakeContributionsRepository(world))
      .overrideProvider(CONTRIBUTOR_SEARCH)
      .useValue(new FakeContributorsRepository(world))
      .overrideProvider(VOWS_REPOSITORY)
      .useValue(new FakeVowsRepository(world))
      .overrideProvider(TRANSACTION_RUNNER)
      .useValue(world.transactions)
      .overrideProvider(DOCUMENT_SEQUENCE_STORE)
      .useValue(world.sequences)
      .overrideProvider(AUDIT_RECORDER)
      .useValue(audit)
      .overrideProvider(Clock)
      .useValue(new FixedClock('2026-11-02'))
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    tokens = app.get(AccessTokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const tithe = {
    contributionTypeId: TYPE.tithe,
    personId: PERSON.ana,
    receivedOn: '2026-11-02',
    amount: 250000,
    paymentMethod: 'CASH',
  };

  describe('access control', () => {
    it('answers 401 without a token', async () => {
      const response = await call('GET', '/api/accounting/contributions', {
        scope: 'C:10',
      });

      expect(response.statusCode).toBe(401);
    });

    it('answers 400 SCOPE_REQUIRED without the X-Scope header', async () => {
      const response = await call('GET', '/api/accounting/contributions', {
        user: TREASURER,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'SCOPE_REQUIRED' });
    });

    it('answers 403 to a role without contributions.read', async () => {
      for (const url of [
        '/api/accounting/contributions',
        '/api/accounting/contributions/form-options',
        '/api/accounting/contributors/search?q=Ana',
        '/api/accounting/vow-pledges',
      ]) {
        const response = await call('GET', url, {
          user: SECRETARY,
          scope: 'C:10',
        });
        expect(response.statusCode, url).toBe(403);
      }
    });

    it('lets a read-only role read but not write', async () => {
      const read = await call('GET', '/api/accounting/contributions', {
        user: PASTOR,
        scope: 'C:10',
      });
      const write = await call('POST', '/api/accounting/contributions', {
        user: PASTOR,
        scope: 'C:10',
        body: tithe,
      });
      const pledge = await call('POST', '/api/accounting/vow-pledges', {
        user: PASTOR,
        scope: 'C:10',
        body: {},
      });

      expect(read.statusCode).toBe(200);
      expect(write.statusCode).toBe(403);
      expect(pledge.statusCode).toBe(403);
    });

    it('answers 403 SCOPE_FORBIDDEN when the user asks for a sede that is not theirs', async () => {
      const response = await call('GET', '/api/accounting/contributions', {
        user: TREASURER,
        scope: 'C:11',
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'SCOPE_FORBIDDEN' });
    });
  });

  describe('contributions', () => {
    it('records a contribution, lists it, shows its detail and voids it', async () => {
      const created = await asTreasurer(
        'POST',
        '/api/accounting/contributions',
        tithe,
      );
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        receiptNumber: 'REC-2026-00001',
        status: 'RECORDED',
        contributorName: 'Ana Pérez',
        memberCode: 'SC-0130',
        amount: 250000,
      });
      const { id } = created.json<{ id: number }>();

      const list = await asTreasurer(
        'GET',
        '/api/accounting/contributions?year=2026&month=11&pageSize=5',
      );
      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({
        total: 1,
        page: 1,
        pageSize: 5,
        totalAmount: 250000,
        label: 'Noviembre 2026',
      });

      const detail = await asTreasurer(
        'GET',
        `/api/accounting/contributions/${id}`,
      );
      expect(detail.json()).toMatchObject({
        id,
        recordedByName: 'Tesorera',
        voidBlock: null,
      });

      const voided = await asTreasurer(
        'POST',
        `/api/accounting/contributions/${id}/void`,
        {
          reason: 'Valor digitado con error; se registra de nuevo.',
        },
      );
      expect(voided.statusCode).toBe(200);
      expect(voided.json()).toMatchObject({ status: 'VOIDED' });
      expect(audit.entries.map((e) => e.action)).toEqual(
        expect.arrayContaining([
          'CONTRIBUTION_RECORDED',
          'CONTRIBUTION_VOIDED',
        ]),
      );
    });

    it('explains validation failures in Spanish with a 400', async () => {
      const response = await asTreasurer(
        'POST',
        '/api/accounting/contributions',
        { ...tithe, amount: 0 },
      );

      expect(response.statusCode).toBe(400);
      expect(response.json<{ message: string[] }>().message).toEqual(
        expect.arrayContaining(['El valor debe ser mayor que cero.']),
      );
    });

    it('answers business rule failures with their code', async () => {
      const closed = await asTreasurer(
        'POST',
        '/api/accounting/contributions',
        { ...tithe, receivedOn: '2026-10-25' },
      );
      const future = await asTreasurer(
        'POST',
        '/api/accounting/contributions',
        { ...tithe, receivedOn: '2026-11-20' },
      );
      const noReason = await asTreasurer(
        'POST',
        '/api/accounting/contributions/1/void',
        { reason: 'corto' },
      );

      expect(closed.statusCode).toBe(409);
      expect(closed.json()).toMatchObject({ code: 'PERIOD_CLOSED' });
      expect(future.statusCode).toBe(400);
      expect(future.json()).toMatchObject({ code: 'FUTURE_DATE' });
      expect(noReason.statusCode).toBe(400);
    });

    it('answers 404 for an id that is not a number and for the contribution of another sede or denomination', async () => {
      const created = await asTreasurer(
        'POST',
        '/api/accounting/contributions',
        tithe,
      );
      const { id } = created.json<{ id: number }>();

      expect(
        (await asTreasurer('GET', '/api/accounting/contributions/abc'))
          .statusCode,
      ).toBe(404);
      expect(
        (
          await call('GET', `/api/accounting/contributions/${id}`, {
            user: NORTH_TREASURER,
            scope: 'C:11',
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await call('GET', `/api/accounting/contributions/${id}`, {
            user: OTHER_TREASURER,
            scope: 'C:20',
          })
        ).statusCode,
      ).toBe(404);
      const voidFromOther = await call(
        'POST',
        `/api/accounting/contributions/${id}/void`,
        {
          user: NORTH_TREASURER,
          scope: 'C:11',
          body: { reason: 'Intento desde otra sede.' },
        },
      );
      expect(voidFromOther.statusCode).toBe(404);
    });

    it('rejects unknown fields instead of ignoring them', async () => {
      const response = await asTreasurer(
        'POST',
        '/api/accounting/contributions',
        { ...tithe, recordedById: 99 },
      );

      expect(response.statusCode).toBe(400);
    });

    it('exports a CSV attachment', async () => {
      const response = await asTreasurer(
        'GET',
        '/api/accounting/contributions/export?year=2026&month=11',
      );

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="aportes-2026-11-01_2026-11-30.csv"',
      );
      expect(response.body.startsWith(`${CSV_BOM}Fecha;Recibo;`)).toBe(true);
    });

    it('serves the form options and the masked contributor search', async () => {
      const options = await asTreasurer(
        'GET',
        '/api/accounting/contributions/form-options',
      );
      const search = await asTreasurer(
        'GET',
        '/api/accounting/contributors/search?q=Ana',
      );
      const empty = await asTreasurer(
        'GET',
        '/api/accounting/contributors/search?q=A',
      );

      expect(options.json()).toMatchObject({
        congregationScoped: true,
        scopeLabel: 'Sede Central',
      });
      expect(search.json()).toEqual([
        {
          id: PERSON.ana,
          fullName: 'Ana Pérez',
          memberCode: 'SC-0130',
          congregationName: 'Sede Central',
          documentHint: 'CC ···1904',
        },
      ]);
      expect(empty.json()).toEqual([]);
    });
  });

  describe('vows', () => {
    it('creates a pledge, takes a payment, shows the balance and cancels another', async () => {
      const created = await asTreasurer('POST', '/api/accounting/vow-pledges', {
        personId: PERSON.ana,
        contributionTypeId: TYPE.vow,
        pledgedAmount: 1000000,
        pledgedOn: '2026-11-01',
        description: 'Ampliación del templo',
      });
      expect(created.statusCode).toBe(201);
      const pledge = created.json<{ id: number; code: string }>();

      const target = await asTreasurer(
        'GET',
        `/api/accounting/vow-pledges/${pledge.id}/payment-target`,
      );
      expect(target.json()).toMatchObject({
        pledge: { id: pledge.id, balance: 1000000 },
        person: { fullName: 'Ana Pérez' },
      });
      const open = await asTreasurer(
        'GET',
        `/api/accounting/vow-pledges/open?personId=${PERSON.ana}&contributionTypeId=${TYPE.vow}`,
      );
      expect(open.json()).toHaveLength(1);

      const payment = await asTreasurer(
        'POST',
        '/api/accounting/contributions',
        {
          ...tithe,
          contributionTypeId: TYPE.vow,
          vowPledgeId: pledge.id,
          amount: 400000,
        },
      );
      expect(payment.statusCode).toBe(201);
      const tooMuch = await asTreasurer(
        'POST',
        '/api/accounting/contributions',
        {
          ...tithe,
          contributionTypeId: TYPE.vow,
          vowPledgeId: pledge.id,
          amount: 700000,
        },
      );
      expect(tooMuch.statusCode).toBe(409);
      expect(tooMuch.json()).toMatchObject({
        code: 'VOW_PAYMENT_EXCEEDS_BALANCE',
      });

      const overview = await asTreasurer(
        'GET',
        '/api/accounting/vow-pledges?status=ACTIVE&search=ana',
      );
      expect(overview.json()).toMatchObject({
        total: 1,
        congregationScoped: true,
        statusCounts: { ALL: 1, ACTIVE: 1 },
        kpis: {
          pledgedTotal: 1000000,
          paidTotal: 400000,
          balanceTotal: 600000,
        },
      });
      expect(overview.json<{ items: unknown[] }>().items[0]).toMatchObject({
        code: pledge.code,
        paid: 400000,
        balance: 600000,
        progress: 40,
      });

      const detail = await asTreasurer(
        'GET',
        `/api/accounting/vow-pledges/${pledge.id}`,
      );
      expect(detail.json<{ payments: unknown[] }>().payments).toHaveLength(1);

      const edited = await asTreasurer(
        'PATCH',
        `/api/accounting/vow-pledges/${pledge.id}`,
        { dueOn: '2027-06-30' },
      );
      expect(edited.json()).toMatchObject({ dueOn: '2027-06-30' });

      const cancelled = await asTreasurer(
        'POST',
        `/api/accounting/vow-pledges/${pledge.id}/cancel`,
        {
          reason: 'El miembro cambió de ciudad.',
        },
      );
      expect(cancelled.json()).toMatchObject({
        status: 'CANCELLED',
        paid: 400000,
      });
    });

    it('does not show a pledge to another denomination', async () => {
      const created = await asTreasurer('POST', '/api/accounting/vow-pledges', {
        personId: PERSON.ana,
        contributionTypeId: TYPE.vow,
        pledgedAmount: 5000,
        pledgedOn: '2026-11-01',
      });
      const { id } = created.json<{ id: number }>();

      const detail = await call('GET', `/api/accounting/vow-pledges/${id}`, {
        user: OTHER_TREASURER,
        scope: 'C:20',
      });
      const target = await call(
        'GET',
        `/api/accounting/vow-pledges/${id}/payment-target`,
        { user: OTHER_TREASURER, scope: 'C:20' },
      );
      const list = await call('GET', '/api/accounting/vow-pledges', {
        user: OTHER_TREASURER,
        scope: 'C:20',
      });

      expect(detail.statusCode).toBe(404);
      expect(target.statusCode).toBe(404);
      expect(list.json()).toMatchObject({ total: 0 });
    });

    it('exports the pledges as CSV', async () => {
      const response = await asTreasurer(
        'GET',
        '/api/accounting/vow-pledges/export',
      );

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="votos-2026-11-02.csv"',
      );
    });
  });
});
