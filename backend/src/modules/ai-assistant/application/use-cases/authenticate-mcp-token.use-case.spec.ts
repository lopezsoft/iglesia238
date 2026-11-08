import { UnauthenticatedException } from '../../../../common/errors/domain.exception.js';
import type { SmartLogger } from '../../../../common/logging/smart-logger.service.js';
import {
  FixedClock,
  InMemoryAiSettings,
  RecordingAudit,
  transactions,
} from '../../testing/ai-test-world.js';
import { buildTenantContext } from '../../../../../test/support/tenants.js';
import { generateAiToken } from '../ai-access-token.js';
import type { AiTool } from '../tools/ai-tool.js';
import { AiToolCatalog } from '../tools/ai-tool-catalog.js';
import { AuthenticateMcpTokenUseCase } from './authenticate-mcp-token.use-case.js';
import { CreateAiTokenUseCase } from './ai-settings.use-cases.js';

const tool = (name: string, permission: string): AiTool => ({
  name,
  title: name,
  description: name,
  inputSchema: { type: 'object' },
  permission,
  run: () => Promise.resolve({}),
});
const catalog = new AiToolCatalog(
  [
    tool('a', 'reports.read'),
    tool('b', 'attendance.write'),
    tool('c', 'reports.read'),
  ],
  { error: vi.fn() } as unknown as SmartLogger,
);

async function build(options: { mcp?: boolean } = {}) {
  const repository = new InMemoryAiSettings();
  repository.settings = {
    id: 1,
    congregationId: 10,
    chatEnabled: false,
    mcpEnabled: options.mcp ?? true,
    provider: 'ANTHROPIC',
    model: 'claude-opus-5-5',
    apiKeyCipher: null,
    apiKeyLast4: null,
  };
  const clock = new FixedClock();
  const issue = new CreateAiTokenUseCase(
    repository,
    transactions,
    new RecordingAudit(),
    clock,
  );
  const created = await issue.execute(
    buildTenantContext({ permissions: ['ai.manage'], userId: 7 }),
    { name: 'Claude' },
  );
  return {
    repository,
    clock,
    token: created.token,
    issue,
    authenticate: new AuthenticateMcpTokenUseCase(repository, catalog, clock),
  };
}

describe('AuthenticateMcpTokenUseCase', () => {
  it('turns a valid token into a context of its sede that holds only the permissions of the tools', async () => {
    const { authenticate, token } = await build();

    const tenant = await authenticate.execute(token);

    expect(tenant).toMatchObject({
      kind: 'CONGREGATION',
      denominationId: 1,
      congregationId: 10,
      userId: 7,
      sessionId: 'mcp:1',
    });
    expect([...tenant.permissions].sort()).toEqual([
      'attendance.write',
      'reports.read',
    ]);
    expect(tenant.has('members.write')).toBe(false);
    expect(tenant.has('cash-transactions.write')).toBe(false);
  });

  it.each([
    ['no token', undefined],
    ['an empty token', ''],
    ['something that is not a token', 'Bearer abc'],
    [
      'a token of the right shape that was never issued',
      generateAiToken().token,
    ],
  ])('refuses %s with the same 401', async (_label, candidate) => {
    const { authenticate } = await build();

    await expect(authenticate.execute(candidate)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
  });

  it('refuses a revoked token', async () => {
    const { authenticate, token, repository } = await build();
    repository.tokens[0] = {
      ...repository.tokens[0],
      revokedAt: new FixedClock().now(),
    };

    await expect(authenticate.execute(token)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
  });

  it('refuses a token once it expired, and not before', async () => {
    const { authenticate, issue, clock } = await build();
    const created = await issue.execute(
      buildTenantContext({ permissions: ['ai.manage'], userId: 7 }),
      { name: 'Temporal', expiresInDays: 1 },
    );

    await expect(authenticate.execute(created.token)).resolves.toBeDefined();
    clock.advance(24 * 60 * 60 * 1000);
    await expect(authenticate.execute(created.token)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
  });

  it('refuses every token of a sede that switched the connections off', async () => {
    const { authenticate, token } = await build({ mcp: false });

    await expect(authenticate.execute(token)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
  });

  it('refuses a token of a sede that was deactivated', async () => {
    const { authenticate, token, repository } = await build();
    repository.sedeActive = false;

    await expect(authenticate.execute(token)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
  });

  describe('the "last used" mark', () => {
    it('is written the first time', async () => {
      const { authenticate, token, repository } = await build();

      await authenticate.execute(token);

      expect(repository.touched).toEqual([1]);
    });

    it('is not written again within a minute', async () => {
      const { authenticate, token, repository, clock } = await build();
      await authenticate.execute(token);
      clock.advance(30_000);

      await authenticate.execute(token);

      expect(repository.touched).toEqual([1]);
    });

    it('is written again after a minute', async () => {
      const { authenticate, token, repository, clock } = await build();
      await authenticate.execute(token);
      clock.advance(61_000);

      await authenticate.execute(token);

      expect(repository.touched).toEqual([1, 1]);
    });

    it('does not stop the connection when it cannot be written', async () => {
      const { authenticate, token, repository } = await build();
      repository.touchToken = () =>
        Promise.reject(new Error('base de datos caída'));

      await expect(authenticate.execute(token)).resolves.toBeDefined();
    });
  });
});
