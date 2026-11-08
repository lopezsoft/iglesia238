import { buildTenantContext } from '../../../../../test/support/tenants.js';
import {
  BusinessRuleException,
  InvalidInputException,
  NotFoundDomainException,
  ServiceUnavailableDomainException,
} from '../../../../common/errors/domain.exception.js';
import {
  FixedClock,
  InMemoryAiSettings,
  RecordingAudit,
  ScriptedGateway,
  TEST_NOW,
  testCipher,
  transactions,
} from '../../testing/ai-test-world.js';
import { hashAiToken } from '../ai-access-token.js';
import { AiProviderError } from '../ports/ai-assistant.ports.js';
import {
  CreateAiTokenUseCase,
  GetAiSettingsUseCase,
  MAX_ACTIVE_AI_TOKENS,
  RemoveAiKeyUseCase,
  RevokeAiTokenUseCase,
  SaveAiKeyUseCase,
  UpdateAiSettingsUseCase,
} from './ai-settings.use-cases.js';

const MCP_URL = 'https://app.iglesia238.com/api/mcp';
const KEY = 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

const pastor = buildTenantContext({ permissions: ['ai.manage'], userId: 7 });
const wide = buildTenantContext({
  kind: 'DENOMINATION',
  permissions: ['ai.manage'],
});

function build() {
  const repository = new InMemoryAiSettings();
  const gateway = new ScriptedGateway();
  const audit = new RecordingAudit();
  const clock = new FixedClock();
  const get = new GetAiSettingsUseCase(repository, MCP_URL, clock);
  return {
    repository,
    gateway,
    audit,
    clock,
    get,
    update: new UpdateAiSettingsUseCase(repository, transactions, audit, get),
    saveKey: new SaveAiKeyUseCase(
      repository,
      testCipher,
      gateway,
      transactions,
      audit,
      get,
    ),
    removeKey: new RemoveAiKeyUseCase(repository, transactions, audit, get),
    createToken: new CreateAiTokenUseCase(
      repository,
      transactions,
      audit,
      clock,
    ),
    revokeToken: new RevokeAiTokenUseCase(
      repository,
      transactions,
      audit,
      clock,
    ),
  };
}

describe('GetAiSettingsUseCase', () => {
  it('shows a sede that never touched it as switched off, with the default model and no key', async () => {
    const { get } = build();

    expect(await get.execute(pastor)).toMatchObject({
      congregationId: 10,
      congregationName: 'Sede Central',
      chatEnabled: false,
      mcpEnabled: false,
      provider: 'ANTHROPIC',
      model: 'claude-opus-5-5',
      keyConfigured: false,
      keyLast4: null,
      mcpUrl: MCP_URL,
      tokens: [],
    });
  });

  it('offers the models the sede can pick from', async () => {
    const { get } = build();

    const view = await get.execute(pastor);

    expect(view.models.map((model) => model.id)).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
    ]);
  });

  it('asks a denomination-wide session to pick a sede first', async () => {
    const { get } = build();

    await expect(get.execute(wide)).rejects.toThrow('Selecciona una sede');
  });

  it('answers 404 when the sede does not exist', async () => {
    const { get, repository } = build();
    repository.sedeExists = false;

    await expect(get.execute(pastor)).rejects.toBeInstanceOf(
      NotFoundDomainException,
    );
  });
});

describe('UpdateAiSettingsUseCase', () => {
  it('turns on the connections from outside without needing a key', async () => {
    const { update, audit } = build();

    const view = await update.execute(pastor, { mcpEnabled: true }, '10.0.0.1');

    expect(view.mcpEnabled).toBe(true);
    expect(view.chatEnabled).toBe(false);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'AI_SETTINGS_UPDATED',
      entity: 'CongregationAiSettings',
      congregationId: 10,
      changes: { mcpEnabled: { from: false, to: true } },
      ipAddress: '10.0.0.1',
    });
  });

  it('will not turn on the chat while the sede has no key', async () => {
    const { update, repository } = build();

    const failure = await update
      .execute(pastor, { chatEnabled: true })
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(BusinessRuleException);
    expect((failure as { code: string }).code).toBe('AI_KEY_REQUIRED');
    expect(repository.settings).toBeNull();
  });

  it('turns on the chat once there is a key, and lets the sede pick another model', async () => {
    const { update, saveKey } = build();
    await saveKey.execute(pastor, KEY);

    const view = await update.execute(pastor, {
      chatEnabled: true,
      model: 'claude-haiku-5-5',
    });

    expect(view).toMatchObject({
      chatEnabled: true,
      model: 'claude-haiku-5-5',
    });
  });

  it('rejects a model that is not in the list', async () => {
    const { update } = build();

    const failure = await update
      .execute(pastor, { model: 'gpt-5' })
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(InvalidInputException);
    expect((failure as { code: string }).code).toBe('INVALID_AI_MODEL');
  });

  it('writes nothing, and audits nothing, when nothing changes', async () => {
    const { update, audit, repository } = build();

    await update.execute(pastor, { chatEnabled: false, mcpEnabled: false });

    expect(repository.settings).toBeNull();
    expect(audit.entries).toEqual([]);
  });

  it('keeps what it was not asked to change', async () => {
    const { update } = build();
    await update.execute(pastor, {
      mcpEnabled: true,
      model: 'claude-sonnet-5-5',
    });

    const view = await update.execute(pastor, { mcpEnabled: false });

    expect(view).toMatchObject({
      mcpEnabled: false,
      model: 'claude-sonnet-5-5',
    });
  });
});

describe('SaveAiKeyUseCase', () => {
  it('checks the key with the provider, stores it encrypted and shows only its last 4 characters', async () => {
    const { saveKey, gateway, repository } = build();

    const view = await saveKey.execute(pastor, `  ${KEY}  `);

    expect(gateway.verified).toEqual([KEY]);
    expect(repository.settings?.apiKeyCipher).toBeTruthy();
    expect(repository.settings?.apiKeyCipher).not.toContain(KEY);
    expect(testCipher.decrypt(repository.settings?.apiKeyCipher ?? '')).toBe(
      KEY,
    );
    expect(view).toMatchObject({
      keyConfigured: true,
      keyLast4: KEY.slice(-4),
    });
    expect(JSON.stringify(view)).not.toContain(KEY);
  });

  it('leaves no trace of the key in the audit log', async () => {
    const { saveKey, audit } = build();

    await saveKey.execute(pastor, KEY, '10.0.0.1');

    expect(audit.entries[0]).toMatchObject({
      action: 'AI_CREDENTIAL_SAVED',
      changes: { credentialOnFile: { from: false, to: true } },
    });
    expect(JSON.stringify(audit.entries)).not.toContain(KEY);
    expect(JSON.stringify(audit.entries)).not.toContain(KEY.slice(-4));
  });

  it('records that a key was replaced', async () => {
    const { saveKey, audit } = build();
    await saveKey.execute(pastor, KEY);

    await saveKey.execute(pastor, `${KEY}Z`);

    expect(audit.entries[1]).toMatchObject({
      changes: { credentialOnFile: { from: true, to: true } },
    });
  });

  it.each([
    '',
    'hola',
    'sk-ant-corta',
    'sk-openai-AbCdEfGhIjKlMnOpQrStUvWxYz',
    `${KEY} ${KEY}`,
  ])(
    'rejects a text that does not look like a key, without asking the provider: %j',
    async (text) => {
      const { saveKey, gateway, repository } = build();

      const failure = await saveKey
        .execute(pastor, text)
        .catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(InvalidInputException);
      expect((failure as { code: string }).code).toBe('INVALID_AI_KEY');
      expect(gateway.verified).toEqual([]);
      expect(repository.settings).toBeNull();
    },
  );

  it('does not store a key the provider rejects', async () => {
    const { saveKey, gateway, repository } = build();
    gateway.verifyError = new AiProviderError('AUTHENTICATION', 'no');

    const failure = await saveKey.execute(pastor, KEY).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(InvalidInputException);
    expect((failure as { code: string }).code).toBe('INVALID_AI_KEY');
    expect(repository.settings).toBeNull();
  });

  it('says to try later, and stores nothing, when the provider cannot be reached', async () => {
    const { saveKey, gateway, repository } = build();
    gateway.verifyError = new AiProviderError('UNAVAILABLE', 'caído');

    await expect(saveKey.execute(pastor, KEY)).rejects.toBeInstanceOf(
      ServiceUnavailableDomainException,
    );
    expect(repository.settings).toBeNull();
  });
});

describe('RemoveAiKeyUseCase', () => {
  it('removes the key and, with it, the chat', async () => {
    const { saveKey, update, removeKey, repository, audit } = build();
    await saveKey.execute(pastor, KEY);
    await update.execute(pastor, { chatEnabled: true });

    const view = await removeKey.execute(pastor);

    expect(view).toMatchObject({
      keyConfigured: false,
      keyLast4: null,
      chatEnabled: false,
    });
    expect(repository.settings?.apiKeyCipher).toBeNull();
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'AI_CREDENTIAL_REMOVED',
      changes: { credentialOnFile: { from: true, to: false } },
    });
  });

  it('keeps the connections from outside on: they do not use the key', async () => {
    const { saveKey, update, removeKey } = build();
    await saveKey.execute(pastor, KEY);
    await update.execute(pastor, { mcpEnabled: true });

    expect((await removeKey.execute(pastor)).mcpEnabled).toBe(true);
  });

  it('does nothing, and audits nothing, when there was no key', async () => {
    const { removeKey, audit } = build();

    await removeKey.execute(pastor);

    expect(audit.entries).toEqual([]);
  });
});

describe('CreateAiTokenUseCase', () => {
  it('gives the full token once and stores only its hash', async () => {
    const { createToken, repository } = build();

    const created = await createToken.execute(pastor, {
      name: '  Claude del pastor  ',
    });

    expect(created.token).toMatch(/^i238_mcp_[A-Za-z0-9_-]{43}$/);
    expect(created).toMatchObject({
      name: 'Claude del pastor',
      tokenPrefix: created.token.slice(0, 14),
      active: true,
      expiresAt: null,
      lastUsedAt: null,
      createdByName: 'Marta Gómez',
    });
    expect(repository.tokens[0].tokenHash).toBe(hashAiToken(created.token));
    expect(JSON.stringify(repository.tokens)).not.toContain(created.token);
  });

  it('does not show the token again in the settings', async () => {
    const { createToken, get } = build();
    const created = await createToken.execute(pastor, { name: 'Claude' });

    const view = await get.execute(pastor);

    expect(view.tokens).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain(created.token);
    expect(view.tokens[0]).not.toHaveProperty('token');
  });

  it('sets the expiry in days from now', async () => {
    const { createToken } = build();

    const created = await createToken.execute(pastor, {
      name: 'Temporal',
      expiresInDays: 30,
    });

    expect(created.expiresAt).toBe(
      new Date(TEST_NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it('audits who created which connection, with its name and never the token', async () => {
    const { createToken, audit } = build();

    const created = await createToken.execute(
      pastor,
      { name: 'Claude' },
      '10.0.0.1',
    );

    expect(audit.entries[0]).toMatchObject({
      action: 'AI_ACCESS_CREATED',
      entity: 'AiAccessToken',
      changes: { connectionName: { from: null, to: 'Claude' } },
      ipAddress: '10.0.0.1',
    });
    expect(JSON.stringify(audit.entries)).not.toContain(created.token);
  });

  it.each([[''], ['   '], ['x'.repeat(81)]])(
    'rejects the name %j',
    async (name) => {
      const { createToken } = build();

      await expect(
        createToken.execute(pastor, { name }),
      ).rejects.toBeInstanceOf(InvalidInputException);
    },
  );

  it.each([[0], [-5], [366], [1.5]])(
    'rejects an expiry of %j days',
    async (days) => {
      const { createToken } = build();

      await expect(
        createToken.execute(pastor, { name: 'Claude', expiresInDays: days }),
      ).rejects.toBeInstanceOf(InvalidInputException);
    },
  );

  it(`allows up to ${MAX_ACTIVE_AI_TOKENS} active connections and asks to revoke one before another`, async () => {
    const { createToken, revokeToken } = build();
    for (let index = 0; index < MAX_ACTIVE_AI_TOKENS; index += 1) {
      await createToken.execute(pastor, { name: `Conexión ${index}` });
    }

    const failure = await createToken
      .execute(pastor, { name: 'Una más' })
      .catch((e: unknown) => e);
    expect((failure as { code: string }).code).toBe('AI_TOKEN_LIMIT');

    await revokeToken.execute(pastor, 1);
    await expect(
      createToken.execute(pastor, { name: 'Una más' }),
    ).resolves.toBeDefined();
  });

  it('does not count expired connections against the limit', async () => {
    const { createToken, clock } = build();
    for (let index = 0; index < MAX_ACTIVE_AI_TOKENS; index += 1) {
      await createToken.execute(pastor, {
        name: `Conexión ${index}`,
        expiresInDays: 1,
      });
    }
    clock.advance(2 * 24 * 60 * 60 * 1000);

    await expect(
      createToken.execute(pastor, { name: 'Nueva' }),
    ).resolves.toBeDefined();
  });
});

describe('RevokeAiTokenUseCase', () => {
  it('revokes the connection at once and audits it', async () => {
    const { createToken, revokeToken, get, audit, repository } = build();
    await createToken.execute(pastor, { name: 'Claude' });

    await revokeToken.execute(pastor, 1, '10.0.0.1');

    expect(repository.tokens[0].revokedAt).toEqual(TEST_NOW);
    expect((await get.execute(pastor)).tokens[0]).toMatchObject({
      active: false,
    });
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'AI_ACCESS_REVOKED',
      entityId: 1,
      ipAddress: '10.0.0.1',
    });
  });

  it('answers 404 for a connection that does not exist, that is of another sede or was revoked already', async () => {
    const { createToken, revokeToken, repository } = build();
    await createToken.execute(pastor, { name: 'Claude' });
    repository.tokens[0] = { ...repository.tokens[0], congregationId: 11 };

    await expect(revokeToken.execute(pastor, 1)).rejects.toBeInstanceOf(
      NotFoundDomainException,
    );
    await expect(revokeToken.execute(pastor, 99)).rejects.toBeInstanceOf(
      NotFoundDomainException,
    );
  });

  it('cannot revoke twice', async () => {
    const { createToken, revokeToken } = build();
    await createToken.execute(pastor, { name: 'Claude' });
    await revokeToken.execute(pastor, 1);

    await expect(revokeToken.execute(pastor, 1)).rejects.toBeInstanceOf(
      NotFoundDomainException,
    );
  });
});
