import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { AUDIT_RECORDER } from '../src/common/audit/audit-recorder.port.js';
import { TRANSACTION_RUNNER } from '../src/common/persistence/transaction.js';
import { AccessTokenService } from '../src/common/security/access-token.service.js';
import { SESSION_VALIDATOR } from '../src/common/security/session-validator.port.js';
import {
  ASSIGNMENTS_READER,
  AssignmentsReader,
  UserAccess,
} from '../src/common/tenancy/assignments-reader.port.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import {
  AI_GATEWAY,
  AI_SETTINGS_REPOSITORY,
} from '../src/modules/ai-assistant/application/ports/ai-assistant.ports.js';
import {
  AI_TOOLS,
  type AiTool,
} from '../src/modules/ai-assistant/application/tools/ai-tool.js';
import {
  InMemoryAiSettings,
  RecordingAudit,
  ScriptedGateway,
  answer,
  asksForTool,
  transactions,
} from '../src/modules/ai-assistant/testing/ai-test-world.js';

const PASTOR = 1;
const TREASURER = 2;
const SECRETARY = 3;
const KEY = 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

function sedeUser(
  userId: number,
  roleCode: string,
  permissions: string[],
): UserAccess {
  return {
    userId,
    isActive: true,
    assignments: [
      {
        roleCode,
        kind: 'CONGREGATION',
        scopeKey: 'C:10',
        denominationId: 1,
        congregationId: 10,
        permissions,
      },
    ],
  };
}

const access = new Map<number, UserAccess>([
  [PASTOR, sedeUser(PASTOR, 'PASTOR', ['ai.manage', 'ai.use', 'reports.read'])],
  [TREASURER, sedeUser(TREASURER, 'TREASURER', ['ai.use', 'reports.read'])],
  [SECRETARY, sedeUser(SECRETARY, 'SECRETARY', ['attendance.write'])],
]);

const reader: AssignmentsReader = {
  loadAccess: (userId) => Promise.resolve(access.get(userId) ?? null),
  findCongregationDenominationId: (id) => Promise.resolve(id === 10 ? 1 : null),
};

const financialTool: AiTool = {
  name: 'resumen_financiero',
  title: 'Resumen financiero',
  description: 'Ingresos y egresos de la sede.',
  inputSchema: { type: 'object', properties: {} },
  permission: 'reports.read',
  run: () => Promise.resolve({ ingresos: 1_250_000 }),
};

describe('AI assistant API', () => {
  let app: NestFastifyApplication;
  let tokens: AccessTokenService;
  const repository = new InMemoryAiSettings();
  const gateway = new ScriptedGateway();
  const audit = new RecordingAudit();

  const call = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    options: { user?: number; body?: object } = {},
  ) =>
    app.inject({
      method,
      url,
      payload: options.body,
      headers:
        options.user === undefined
          ? {}
          : {
              authorization: `Bearer ${(await tokens.sign({ userId: options.user, sessionId: 's' })).token}`,
              'x-scope': 'C:10',
            },
    });

  const mcp = (token: string | null, body: object) =>
    app.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: body,
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    });

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
      .overrideProvider(TRANSACTION_RUNNER)
      .useValue(transactions)
      .overrideProvider(AUDIT_RECORDER)
      .useValue(audit)
      .overrideProvider(AI_SETTINGS_REPOSITORY)
      .useValue(repository)
      .overrideProvider(AI_GATEWAY)
      .useValue(gateway)
      .overrideProvider(AI_TOOLS)
      .useValue([financialTool])
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

  describe('settings of the sede', () => {
    it.each([
      ['GET', '/api/ai/settings'],
      ['PATCH', '/api/ai/settings'],
      ['PUT', '/api/ai/settings/key'],
      ['POST', '/api/ai/tokens'],
    ] as const)('requires authentication: %s %s', async (method, url) => {
      const response = await app.inject({
        method,
        url,
        headers: { 'x-scope': 'C:10' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('is for who holds ai.manage: the treasury, which only uses the chat, cannot configure it', async () => {
      const response = await call('GET', '/api/ai/settings', {
        user: TREASURER,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('shows a sede that never set it up as off', async () => {
      const response = await call('GET', '/api/ai/settings', { user: PASTOR });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        congregationName: 'Sede Central',
        chatEnabled: false,
        mcpEnabled: false,
        keyConfigured: false,
        mcpUrl: 'http://localhost:4200/api/mcp',
        tokens: [],
      });
    });

    it('saves the key after checking it, and never gives it back', async () => {
      const response = await call('PUT', '/api/ai/settings/key', {
        user: PASTOR,
        body: { apiKey: KEY },
      });

      expect(response.statusCode).toBe(200);
      expect(gateway.verified).toEqual([KEY]);
      expect(response.json()).toMatchObject({
        keyConfigured: true,
        keyLast4: KEY.slice(-4),
      });
      expect(response.body).not.toContain(KEY);
      expect(repository.settings?.apiKeyCipher).toBeTruthy();
      expect(repository.settings?.apiKeyCipher).not.toContain(KEY);
    });

    it('audits the change without the key', () => {
      expect(audit.entries.map((entry) => entry.action)).toContain(
        'AI_CREDENTIAL_SAVED',
      );
      expect(JSON.stringify(audit.entries)).not.toContain(KEY);
    });

    it('rejects a key that is too short before it reaches the rules', async () => {
      const response = await call('PUT', '/api/ai/settings/key', {
        user: PASTOR,
        body: { apiKey: 'corta' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('turns on the chat and the connections', async () => {
      const response = await call('PATCH', '/api/ai/settings', {
        user: PASTOR,
        body: {
          chatEnabled: true,
          mcpEnabled: true,
          model: 'claude-haiku-5-5',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        chatEnabled: true,
        mcpEnabled: true,
        model: 'claude-haiku-5-5',
      });
    });

    it('rejects a model that is not in the list with its stable code', async () => {
      const response = await call('PATCH', '/api/ai/settings', {
        user: PASTOR,
        body: { model: 'gpt-5' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'INVALID_AI_MODEL' });
    });

    it('rejects fields it does not know', async () => {
      const response = await call('PATCH', '/api/ai/settings', {
        user: PASTOR,
        body: { chatEnabled: true, apiKeyCipher: 'robada' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('the chat', () => {
    it('requires ai.use: a role without it is refused', async () => {
      const response = await call('GET', '/api/ai/chat/status', {
        user: SECRETARY,
      });

      expect(response.statusCode).toBe(403);
    });

    it('says what the person can ask', async () => {
      const response = await call('GET', '/api/ai/chat/status', {
        user: TREASURER,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        available: true,
        reason: null,
        model: 'claude-haiku-5-5',
        tools: [{ name: 'resumen_financiero', title: 'Resumen financiero' }],
      });
    });

    it('answers with the figures the tool returned, and says which consultation it made', async () => {
      gateway.enqueue(
        asksForTool('resumen_financiero', {}),
        answer('Este año entraron $1.250.000.'),
      );

      const response = await call('POST', '/api/ai/chat', {
        user: TREASURER,
        body: {
          messages: [{ role: 'user', content: '¿Cuánto entró este año?' }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        reply: 'Este año entraron $1.250.000.',
        consulted: [
          { name: 'resumen_financiero', title: 'Resumen financiero' },
        ],
        model: 'claude-haiku-5-5',
      });
      const toolResults = gateway.requests.at(-1)?.conversation.at(-1);
      expect(toolResults).toMatchObject({
        kind: 'tool-results',
        results: [{ content: '{"ingresos":1250000}', isError: false }],
      });
      expect(gateway.requests.at(-1)?.apiKey).toBe(KEY);
    });

    it.each([
      [{}],
      [{ messages: [] }],
      [{ messages: [{ role: 'system', content: 'hola' }] }],
      [{ messages: [{ role: 'user', content: '' }] }],
      [{ messages: [{ role: 'user', content: 'x'.repeat(4001) }] }],
    ])('rejects a conversation that is not valid: %j', async (body) => {
      const response = await call('POST', '/api/ai/chat', {
        user: TREASURER,
        body,
      });

      expect(response.statusCode).toBe(400);
    });

    it('tells the pastor to renew a key the provider no longer accepts', async () => {
      const { AiProviderError } =
        await import('../src/modules/ai-assistant/application/ports/ai-assistant.ports.js');
      gateway.enqueue(new AiProviderError('AUTHENTICATION', 'x'));

      const response = await call('POST', '/api/ai/chat', {
        user: TREASURER,
        body: { messages: [{ role: 'user', content: 'Hola' }] },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'AI_KEY_REJECTED' });
    });

    it('is not available once the sede removes its key', async () => {
      const removed = await call('DELETE', '/api/ai/settings/key', {
        user: PASTOR,
      });
      expect(removed.json()).toMatchObject({
        keyConfigured: false,
        chatEnabled: false,
      });

      const response = await call('POST', '/api/ai/chat', {
        user: TREASURER,
        body: { messages: [{ role: 'user', content: 'Hola' }] },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'AI_NOT_AVAILABLE' });
    });
  });

  describe('connections from outside (MCP)', () => {
    let token: string;

    it('creates a connection and shows the token once', async () => {
      const response = await call('POST', '/api/ai/tokens', {
        user: PASTOR,
        body: { name: 'Claude del pastor', expiresInDays: 30 },
      });

      expect(response.statusCode).toBe(201);
      token = response.json<{ token: string }>().token;
      expect(token).toMatch(/^i238_mcp_/);

      const settings = await call('GET', '/api/ai/settings', { user: PASTOR });
      expect(settings.body).not.toContain(token);
      expect(settings.json()).toMatchObject({
        tokens: [{ name: 'Claude del pastor', active: true }],
      });
    });

    it.each([
      ['without a token', null],
      ['with something that is not a token', 'hola'],
    ])('refuses a request %s with 401', async (_label, candidate) => {
      const response = await mcp(candidate, {
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
      });

      expect(response.statusCode).toBe(401);
    });

    it('does not accept the session of a person in place of a token', async () => {
      const jwt = (await tokens.sign({ userId: PASTOR, sessionId: 's' })).token;

      const response = await mcp(jwt, {
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
      });

      expect(response.statusCode).toBe(401);
    });

    it('does not accept a connection token in the routes of the app', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ai/settings',
        headers: { authorization: `Bearer ${token}`, 'x-scope': 'C:10' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('initialises, lists the read-only tools and runs one', async () => {
      const init = await mcp(token, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      });
      expect(init.statusCode).toBe(200);
      expect(init.json()).toMatchObject({
        id: 1,
        result: {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'iglesia238' },
        },
      });

      const list = await mcp(token, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });
      expect(list.json()).toMatchObject({
        result: {
          tools: [
            { name: 'resumen_financiero', annotations: { readOnlyHint: true } },
          ],
        },
      });

      const run = await mcp(token, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'resumen_financiero', arguments: {} },
      });
      expect(run.json()).toEqual({
        jsonrpc: '2.0',
        id: 3,
        result: {
          content: [{ type: 'text', text: '{"ingresos":1250000}' }],
          isError: false,
        },
      });
    });

    it('answers 202 without a body to a notification', async () => {
      const response = await mcp(token, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      expect(response.statusCode).toBe(202);
      expect(response.body).toBe('');
    });

    it('says that GET is not offered', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/mcp' });

      expect(response.statusCode).toBe(405);
      expect(response.headers.allow).toBe('POST');
    });

    it('stops answering when the sede switches the connections off', async () => {
      await call('PATCH', '/api/ai/settings', {
        user: PASTOR,
        body: { mcpEnabled: false },
      });

      const off = await mcp(token, { jsonrpc: '2.0', id: 1, method: 'ping' });
      expect(off.statusCode).toBe(401);

      await call('PATCH', '/api/ai/settings', {
        user: PASTOR,
        body: { mcpEnabled: true },
      });
      const on = await mcp(token, { jsonrpc: '2.0', id: 1, method: 'ping' });
      expect(on.statusCode).toBe(200);
    });

    it('stops working the moment the token is revoked', async () => {
      const revoked = await call('DELETE', '/api/ai/tokens/1', {
        user: PASTOR,
      });
      expect(revoked.statusCode).toBe(204);

      const response = await mcp(token, {
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
      });

      expect(response.statusCode).toBe(401);
    });

    it('answers 404 when revoking a connection that does not exist', async () => {
      const response = await call('DELETE', '/api/ai/tokens/99', {
        user: PASTOR,
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
