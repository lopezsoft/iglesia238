import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { CONGREGATION_LOOKUP } from '../src/common/accounting/congregation-lookup.port.js';
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
import { TenantScope } from '../src/common/tenancy/tenant-scope.js';
import { Clock } from '../src/common/time/bogota-time.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { ACCOUNT_REPOSITORY } from '../src/modules/accounting-setup/application/account.repository.js';
import { CONTRIBUTION_TYPE_REPOSITORY } from '../src/modules/accounting-setup/application/contribution-type.repository.js';
import { FUND_REPOSITORY } from '../src/modules/accounting-setup/application/fund.repository.js';
import { PERIOD_REPOSITORY } from '../src/modules/accounting-setup/application/period.repository.js';
import { TITHE_RULE_REPOSITORY } from '../src/modules/accounting-setup/application/tithe-rule.repository.js';
import { CASH_BOOK_REPOSITORY } from '../src/modules/cash-book/application/cash-book.repository.js';
import { VOUCHER_READ_REPOSITORY } from '../src/modules/cash-book/application/voucher.repository.js';
import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  FixedClock,
} from './support/accounting-doubles.js';
import {
  FakeCongregationLookup,
  InMemoryAccountRepository,
  InMemoryContributionTypeRepository,
  InMemoryFundRepository,
  InMemoryPeriodRepository,
  InMemoryTitheRuleRepository,
} from './support/accounting-setup-fakes.js';
import {
  FakeSequenceStore,
  InMemoryCashBook,
} from './support/cash-book-fakes.js';

const assignment = (
  roleCode: string,
  congregationId: number,
  denominationId: number,
  permissions: string[],
): RoleAssignmentView => ({
  roleCode,
  kind: 'CONGREGATION',
  scopeKey: `C:${congregationId}`,
  denominationId,
  congregationId,
  permissions,
});

const TREASURER = 1;
const PASTOR = 2;
const OTHER_TREASURER = 3;

const TREASURER_PERMISSIONS = [
  'contributions.read',
  'contributions.write',
  'cash-transactions.write',
  'tithe-settlements.write',
  'budgets.manage',
];

const accessByUser = new Map<number, UserAccess>([
  [
    TREASURER,
    {
      userId: TREASURER,
      isActive: true,
      assignments: [assignment('TREASURER', 10, 1, TREASURER_PERMISSIONS)],
    },
  ],
  [
    PASTOR,
    {
      userId: PASTOR,
      isActive: true,
      assignments: [assignment('PASTOR', 10, 1, ['contributions.read'])],
    },
  ],
  [
    OTHER_TREASURER,
    {
      userId: OTHER_TREASURER,
      isActive: true,
      assignments: [assignment('TREASURER', 20, 2, TREASURER_PERMISSIONS)],
    },
  ],
]);

const reader: AssignmentsReader = {
  loadAccess: (userId) => Promise.resolve(accessByUser.get(userId) ?? null),
  findCongregationDenominationId: (id) =>
    Promise.resolve(id === 10 ? 1 : id === 20 ? 2 : null),
};

const SEDE = TenantScope.of(1, 10);

describe('Accounting setup and cash book over HTTP', () => {
  let app: NestFastifyApplication;
  let tokens: AccessTokenService;
  const funds = new InMemoryFundRepository();
  const accounts = new InMemoryAccountRepository();
  const types = new InMemoryContributionTypeRepository(accounts);
  const periods = new InMemoryPeriodRepository();
  const rules = new InMemoryTitheRuleRepository();
  const sequences = new FakeSequenceStore();
  const book = new InMemoryCashBook(sequences);
  const ids = { fund: 0, expense: 0, period: 0 };

  const call = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    options: { user?: number; scope?: string; payload?: object } = {},
  ) => {
    const token =
      options.user === undefined
        ? undefined
        : (await tokens.sign({ userId: options.user, sessionId: 'sid' })).token;
    return app.inject({
      method,
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.scope ? { 'x-scope': options.scope } : {}),
      },
      payload: options.payload,
    });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn() })
      .overrideProvider(RedisService)
      .useValue({ client: { ping: vi.fn() } })
      .overrideProvider(SESSION_VALIDATOR)
      .useValue({ isActive: () => Promise.resolve(true) })
      .overrideProvider(ASSIGNMENTS_READER)
      .useValue(reader)
      .overrideProvider(TRANSACTION_RUNNER)
      .useValue(new FakeTransactionRunner())
      .overrideProvider(AUDIT_RECORDER)
      .useValue(new FakeAuditRecorder())
      .overrideProvider(DOCUMENT_SEQUENCE_STORE)
      .useValue(sequences)
      .overrideProvider(Clock)
      .useValue(FixedClock.at('2026-11-02'))
      .overrideProvider(CONGREGATION_LOOKUP)
      .useValue(new FakeCongregationLookup(new Map([[10, 'Sede Central']])))
      .overrideProvider(FUND_REPOSITORY)
      .useValue(funds)
      .overrideProvider(ACCOUNT_REPOSITORY)
      .useValue(accounts)
      .overrideProvider(CONTRIBUTION_TYPE_REPOSITORY)
      .useValue(types)
      .overrideProvider(PERIOD_REPOSITORY)
      .useValue(periods)
      .overrideProvider(TITHE_RULE_REPOSITORY)
      .useValue(rules)
      .overrideProvider(CASH_BOOK_REPOSITORY)
      .useValue(book)
      .overrideProvider(VOUCHER_READ_REPOSITORY)
      .useValue(book)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    tokens = app.get(AccessTokenService);

    ids.fund = book.addFund(1, 'Fondo Local').id;
    funds.add(1, 'Fondo Local');
    ids.expense = book.addAccount(1, '510505', { nature: 'EXPENSE' }).id;
    ids.period = book.addPeriod(SEDE, 2026, 11).id;
    book.setOpening(SEDE, ids.fund, 2026, 1_000);
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 401 to every route without a token', async () => {
    const routes: [string, string][] = [
      ['GET', '/api/accounting/setup/overview'],
      ['GET', '/api/accounting/funds'],
      ['POST', '/api/accounting/funds'],
      ['GET', '/api/accounting/accounts'],
      ['GET', '/api/accounting/contribution-types'],
      ['GET', '/api/accounting/periods'],
      ['POST', '/api/accounting/periods'],
      ['GET', '/api/accounting/tithe-rules'],
      ['POST', '/api/accounting/tithe-rules'],
      ['GET', '/api/accounting/cash-book/options'],
      ['GET', '/api/accounting/cash-book'],
      ['POST', '/api/accounting/cash-book/transactions'],
      ['POST', '/api/accounting/cash-book/consolidations'],
      ['POST', '/api/accounting/periods/1/close'],
      ['GET', '/api/accounting/vouchers'],
      ['GET', '/api/accounting/vouchers/1/pdf'],
    ];

    for (const [method, url] of routes) {
      const response = await call(method as 'GET', url);
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('asks for the scope header when the route needs permissions', async () => {
    const response = await call('GET', '/api/accounting/funds', {
      user: TREASURER,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'SCOPE_REQUIRED' });
  });

  it('refuses a scope the user does not hold', async () => {
    const response = await call('GET', '/api/accounting/cash-book/options', {
      user: TREASURER,
      scope: 'C:20',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'SCOPE_FORBIDDEN' });
  });

  it('lets a pastor read the catalogs but not write them nor open the cash book', async () => {
    const read = await call('GET', '/api/accounting/funds', {
      user: PASTOR,
      scope: 'C:10',
    });
    const write = await call('POST', '/api/accounting/funds', {
      user: PASTOR,
      scope: 'C:10',
      payload: { name: 'Dorcas', isActive: true },
    });
    const cash = await call('GET', '/api/accounting/cash-book/options', {
      user: PASTOR,
      scope: 'C:10',
    });
    const reversal = await call(
      'POST',
      '/api/accounting/cash-book/transactions/1/reverse',
      {
        user: PASTOR,
        scope: 'C:10',
        payload: { postedOn: '2026-11-02', reason: 'Motivo de prueba largo' },
      },
    );

    expect(read.statusCode).toBe(200);
    expect(write.statusCode).toBe(403);
    expect(cash.statusCode).toBe(403);
    expect(reversal.statusCode).toBe(403);
  });

  it('validates the body with Spanish messages before reaching the use case', async () => {
    const response = await call(
      'POST',
      '/api/accounting/cash-book/transactions',
      {
        user: TREASURER,
        scope: 'C:10',
        payload: {
          fundId: ids.fund,
          direction: 'SIDEWAYS',
          accountId: ids.expense,
          postedOn: 'hoy',
          amount: 'mucho',
          description: 'x',
        },
      },
    );

    expect(response.statusCode).toBe(400);
    const { message } = response.json<{ message: string[] }>();
    expect(message).toEqual(
      expect.arrayContaining([
        'Indica si el movimiento es una entrada o una salida.',
        'La fecha debe tener el formato AAAA-MM-DD.',
      ]),
    );
  });

  it('records a movement, shows it in the book with its balance and reverses it', async () => {
    const posted = await call(
      'POST',
      '/api/accounting/cash-book/transactions',
      {
        user: TREASURER,
        scope: 'C:10',
        payload: {
          fundId: ids.fund,
          direction: 'OUT',
          accountId: ids.expense,
          postedOn: '2026-11-02',
          amount: 250,
          description: 'Pago servicio de energía',
        },
      },
    );
    expect(posted.statusCode).toBe(201);
    const receipt = posted.json<{
      transactionId: number;
      voucherCode: string;
    }>();
    expect(receipt.voucherCode).toBe('CE-2026-00001');

    const view = await call(
      'GET',
      `/api/accounting/cash-book?fundId=${ids.fund}&periodId=${ids.period}&page=1&pageSize=10`,
      { user: TREASURER, scope: 'C:10' },
    );
    expect(view.statusCode).toBe(200);
    expect(view.json()).toMatchObject({
      opening: 1_000,
      expense: 250,
      closing: 750,
      totalRows: 1,
      rows: [
        { voucherCode: 'CE-2026-00001', balance: 750, reversalBlock: null },
      ],
    });

    const reversed = await call(
      'POST',
      `/api/accounting/cash-book/transactions/${receipt.transactionId}/reverse`,
      {
        user: TREASURER,
        scope: 'C:10',
        payload: {
          postedOn: '2026-11-02',
          reason: 'Factura registrada dos veces',
        },
      },
    );
    expect(reversed.statusCode).toBe(201);
    expect(reversed.json()).toMatchObject({
      direction: 'IN',
      voucherCode: 'CI-2026-00001',
    });

    const again = await call(
      'POST',
      `/api/accounting/cash-book/transactions/${receipt.transactionId}/reverse`,
      {
        user: TREASURER,
        scope: 'C:10',
        payload: {
          postedOn: '2026-11-02',
          reason: 'Segundo intento de reversa',
        },
      },
    );
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'ALREADY_REVERSED' });
  });

  it('lists the vouchers of the sede', async () => {
    const response = await call('GET', '/api/accounting/vouchers?type=CE', {
      user: TREASURER,
      scope: 'C:10',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      items: [
        {
          code: 'CE-2026-00001',
          type: 'CE',
          typeLabel: 'Comprobante de egreso',
        },
      ],
    });
  });

  it('downloads a voucher as a PDF and keeps it inside its sede', async () => {
    const list = await call('GET', '/api/accounting/vouchers?type=CE', {
      user: TREASURER,
      scope: 'C:10',
    });
    const { id } = list.json<{ items: { id: number }[] }>().items[0];

    const pdf = await call('GET', `/api/accounting/vouchers/${id}/pdf`, {
      user: TREASURER,
      scope: 'C:10',
    });
    const other = await call('GET', `/api/accounting/vouchers/${id}/pdf`, {
      user: OTHER_TREASURER,
      scope: 'C:20',
    });
    const pastor = await call('GET', `/api/accounting/vouchers/${id}/pdf`, {
      user: PASTOR,
      scope: 'C:10',
    });

    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['cache-control']).toBe('private, no-store');
    expect(pdf.headers['content-disposition']).toBe(
      'inline; filename="CE-2026-00001.pdf"',
    );
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(other.statusCode).toBe(404);
    expect(pastor.statusCode).toBe(403);
  });

  it('never shows the books of one denomination to another', async () => {
    const otherView = await call(
      'GET',
      `/api/accounting/cash-book?fundId=${ids.fund}&periodId=${ids.period}`,
      { user: OTHER_TREASURER, scope: 'C:20' },
    );
    const otherVouchers = await call('GET', '/api/accounting/vouchers', {
      user: OTHER_TREASURER,
      scope: 'C:20',
    });
    const otherReverse = await call(
      'POST',
      '/api/accounting/cash-book/transactions/1/reverse',
      {
        user: OTHER_TREASURER,
        scope: 'C:20',
        payload: {
          postedOn: '2026-11-02',
          reason: 'Intento desde otra denominación',
        },
      },
    );

    expect(otherView.statusCode).toBe(404);
    expect(otherVouchers.json()).toMatchObject({ total: 0 });
    expect(otherReverse.statusCode).toBe(404);
  });

  it('opens a period and defines the tithe percentages through the setup', async () => {
    const period = await call('POST', '/api/accounting/periods', {
      user: TREASURER,
      scope: 'C:10',
      payload: { year: 2026, month: 10 },
    });
    const rule = await call('POST', '/api/accounting/tithe-rules', {
      user: TREASURER,
      scope: 'C:10',
      payload: {
        effectiveFrom: '2026-01-01',
        nationalShareRate: 0.21,
        localFundRate: 0.03,
      },
    });
    const overview = await call('GET', '/api/accounting/setup/overview', {
      user: TREASURER,
      scope: 'C:10',
    });

    expect(period.statusCode).toBe(201);
    expect(period.json()).toMatchObject({
      label: 'Octubre 2026',
      status: 'OPEN',
    });
    expect(rule.statusCode).toBe(201);
    expect(overview.json()).toMatchObject({
      today: '2026-11-02',
      scopeLabel: 'Sede Central',
      titheRule: { nationalShareRate: 0.21, inForce: true },
    });
  });

  it('answers 204 when a fund is deleted and 404 when it is not there', async () => {
    const created = await call('POST', '/api/accounting/funds', {
      user: TREASURER,
      scope: 'C:10',
      payload: { name: 'Temporal', isActive: true },
    });
    const { id } = created.json<{ id: number }>();

    const removed = await call('DELETE', `/api/accounting/funds/${id}`, {
      user: TREASURER,
      scope: 'C:10',
    });
    const missing = await call('DELETE', `/api/accounting/funds/${id}`, {
      user: TREASURER,
      scope: 'C:10',
    });

    expect(created.statusCode).toBe(201);
    expect(removed.statusCode).toBe(204);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});
