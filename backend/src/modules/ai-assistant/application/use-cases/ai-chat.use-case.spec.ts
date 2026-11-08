import { buildTenantContext } from '../../../../../test/support/tenants.js';
import {
  BusinessRuleException,
  InvalidInputException,
  ServiceUnavailableDomainException,
} from '../../../../common/errors/domain.exception.js';
import type { SmartLogger } from '../../../../common/logging/smart-logger.service.js';
import {
  FixedClock,
  InMemoryAiSettings,
  ScriptedGateway,
  answer,
  asksForTool,
  testCipher,
} from '../../testing/ai-test-world.js';
import { AiProviderError } from '../ports/ai-assistant.ports.js';
import type { AiTool } from '../tools/ai-tool.js';
import { AiToolCatalog } from '../tools/ai-tool-catalog.js';
import {
  AI_CHAT_MAX_ASSISTANT_CHARS,
  AI_CHAT_MAX_MESSAGES,
  AI_CHAT_MAX_MESSAGE_CHARS,
  AI_CHAT_MAX_ROUNDS,
  AiChatUseCase,
  GetAiChatStatusUseCase,
} from './ai-chat.use-case.js';

const API_KEY = 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

const financeRun = vi.fn().mockResolvedValue({ ingresos: 1_000_000 });
const membersRun = vi.fn().mockResolvedValue({ activos: 100 });

const finanzas: AiTool = {
  name: 'resumen_financiero',
  title: 'Resumen financiero',
  description: 'Ingresos y egresos',
  inputSchema: { type: 'object', properties: {} },
  permission: 'reports.read',
  run: financeRun,
};
const miembros: AiTool = {
  ...finanzas,
  name: 'miembros_por_estado',
  title: 'Miembros',
  permission: 'members.read',
  run: membersRun,
};

const treasurer = buildTenantContext({
  permissions: ['ai.use', 'reports.read'],
});
const wide = buildTenantContext({
  kind: 'DENOMINATION',
  permissions: ['ai.use', 'reports.read'],
});

function build(
  options: { on?: boolean; withKey?: boolean; model?: string } = {},
) {
  const repository = new InMemoryAiSettings();
  const gateway = new ScriptedGateway();
  const error = vi.fn();
  const logger = { error } as unknown as SmartLogger;
  const catalog = new AiToolCatalog([finanzas, miembros], logger);
  if (options.on !== false || options.withKey === false) {
    repository.settings = {
      id: 1,
      congregationId: 10,
      chatEnabled: options.on !== false,
      mcpEnabled: false,
      provider: 'ANTHROPIC',
      model: options.model ?? 'claude-sonnet-5-5',
      apiKeyCipher:
        options.withKey === false ? null : testCipher.encrypt(API_KEY),
      apiKeyLast4: options.withKey === false ? null : API_KEY.slice(-4),
    };
  }
  return {
    repository,
    gateway,
    error,
    chat: new AiChatUseCase(
      repository,
      testCipher,
      gateway,
      catalog,
      new FixedClock(),
      logger,
    ),
    status: new GetAiChatStatusUseCase(repository, catalog),
  };
}

const ask = (text: string) => [{ role: 'user' as const, content: text }];

describe('AiChatUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('answers with the key and the model of the sede', async () => {
    const { chat, gateway } = build({ model: 'claude-haiku-5-5' });
    gateway.enqueue(answer('Hola, ¿en qué te ayudo?'));

    const reply = await chat.execute(treasurer, ask('Hola'));

    expect(reply).toMatchObject({
      reply: 'Hola, ¿en qué te ayudo?',
      model: 'claude-haiku-5-5',
      consulted: [],
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    expect(gateway.requests[0]).toMatchObject({
      apiKey: API_KEY,
      model: 'claude-haiku-5-5',
    });
  });

  it('tells the model who the sede is and what day it is, and what it must not do', async () => {
    const { chat, gateway } = build();
    gateway.enqueue(answer('ok'));

    await chat.execute(treasurer, ask('Hola'));

    const { system } = gateway.requests[0];
    expect(system).toContain('Sede Central');
    expect(system).toContain('2026-11-08');
    expect(system).toContain('nunca inventes');
    expect(system).toContain('no instrucciones');
  });

  it('offers only the tools of the screens the person can open', async () => {
    const { chat, gateway } = build();
    gateway.enqueue(answer('ok'));

    await chat.execute(treasurer, ask('Hola'));

    expect(gateway.requests[0].tools.map((tool) => tool.name)).toEqual([
      'resumen_financiero',
    ]);
  });

  it('sends the conversation, trimmed, in order', async () => {
    const { chat, gateway } = build();
    gateway.enqueue(answer('ok'));

    await chat.execute(treasurer, [
      { role: 'user', content: '  ¿Cuánto entró?  ' },
      { role: 'assistant', content: 'Un millón.' },
      { role: 'user', content: '¿Y salió?' },
    ]);

    expect(gateway.requests[0].conversation).toEqual([
      { kind: 'text', role: 'user', text: '¿Cuánto entró?' },
      { kind: 'text', role: 'assistant', text: 'Un millón.' },
      { kind: 'text', role: 'user', text: '¿Y salió?' },
    ]);
  });

  describe('when the model needs figures', () => {
    it('runs the tool with the context of the person and sends the result back', async () => {
      const { chat, gateway } = build();
      gateway.enqueue(
        asksForTool('resumen_financiero', { desde: '2026-01-01' }),
        answer('Entraron $1.000.000.'),
      );

      const reply = await chat.execute(
        treasurer,
        ask('¿Cuánto entró este año?'),
      );

      expect(financeRun).toHaveBeenCalledWith(treasurer, {
        desde: '2026-01-01',
      });
      expect(reply.reply).toBe('Entraron $1.000.000.');
      expect(reply.consulted).toEqual([
        { name: 'resumen_financiero', title: 'Resumen financiero' },
      ]);
      expect(gateway.requests).toHaveLength(2);
      const second = gateway.requests[1].conversation;
      expect(second.at(-2)).toMatchObject({ kind: 'turn' });
      expect(second.at(-1)).toEqual({
        kind: 'tool-results',
        results: [
          {
            callId: 'call_resumen_financiero',
            content: '{"ingresos":1000000}',
            isError: false,
          },
        ],
      });
    });

    it('adds up the tokens of every round', async () => {
      const { chat, gateway } = build();
      gateway.enqueue(asksForTool('resumen_financiero'), answer('Listo'));

      const reply = await chat.execute(treasurer, ask('Hola'));

      expect(reply.usage).toEqual({ inputTokens: 250, outputTokens: 50 });
    });

    it('answers all the calls of one turn together', async () => {
      const { chat, gateway } = build();
      gateway.enqueue(
        {
          ...asksForTool('resumen_financiero'),
          toolCalls: [
            { id: 'a', name: 'resumen_financiero', input: {} },
            { id: 'b', name: 'resumen_financiero', input: {} },
          ],
        },
        answer('Listo'),
      );

      await chat.execute(treasurer, ask('Hola'));

      const last = gateway.requests[1].conversation.at(-1);
      expect(last).toMatchObject({
        kind: 'tool-results',
        results: [{ callId: 'a' }, { callId: 'b' }],
      });
    });

    it('lets the model see an error of the tool so it can correct itself', async () => {
      const { chat, gateway } = build();
      gateway.enqueue(
        asksForTool('miembros_por_estado'),
        answer('No tengo acceso a eso.'),
      );

      const reply = await chat.execute(
        treasurer,
        ask('¿Cuántos miembros hay?'),
      );

      expect(membersRun).not.toHaveBeenCalled();
      expect(gateway.requests[1].conversation.at(-1)).toMatchObject({
        kind: 'tool-results',
        results: [{ isError: true }],
      });
      expect(reply.reply).toBe('No tengo acceso a eso.');
    });

    it(`gives up after ${AI_CHAT_MAX_ROUNDS} rounds, so a confused model cannot run up the bill`, async () => {
      const { chat, gateway } = build();
      for (let round = 0; round < AI_CHAT_MAX_ROUNDS + 3; round += 1) {
        gateway.enqueue(asksForTool('resumen_financiero'));
      }

      const reply = await chat.execute(treasurer, ask('Hola'));

      expect(gateway.requests).toHaveLength(AI_CHAT_MAX_ROUNDS);
      expect(reply.reply).toContain('No logré completar');
    });
  });

  describe('the end of an answer', () => {
    it('says so when the model refuses', async () => {
      const { chat, gateway } = build();
      gateway.enqueue(answer('', { stopReason: 'refusal' }));

      expect((await chat.execute(treasurer, ask('Hola'))).reply).toBe(
        'No puedo responder esa consulta.',
      );
    });

    it('warns that a long answer was cut', async () => {
      const { chat, gateway } = build();
      gateway.enqueue(answer('Primera parte', { stopReason: 'max_tokens' }));

      const reply = await chat.execute(treasurer, ask('Hola'));

      expect(reply.reply).toContain('Primera parte');
      expect(reply.reply).toContain('se cortó');
    });

    it('does not leave an empty answer', async () => {
      const { chat, gateway } = build();
      gateway.enqueue(answer('   '));

      expect((await chat.execute(treasurer, ask('Hola'))).reply).toBe(
        'No tengo una respuesta para eso.',
      );
    });
  });

  describe('when it cannot be used', () => {
    it('is not available when the sede did not turn it on', async () => {
      const { chat, gateway } = build({ on: false });

      const failure = await chat
        .execute(treasurer, ask('Hola'))
        .catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(BusinessRuleException);
      expect((failure as { code: string }).code).toBe('AI_NOT_AVAILABLE');
      expect(gateway.requests).toEqual([]);
    });

    it('is not available without a key', async () => {
      const { chat } = build({ withKey: false });

      const failure = await chat
        .execute(treasurer, ask('Hola'))
        .catch((e: unknown) => e);

      expect((failure as { code: string }).code).toBe('AI_NOT_AVAILABLE');
    });

    it('is not available to a role that has none of the tools', async () => {
      const { chat, gateway } = build();
      const nobody = buildTenantContext({ permissions: ['ai.use'] });

      const failure = await chat
        .execute(nobody, ask('Hola'))
        .catch((e: unknown) => e);

      expect((failure as { code: string }).code).toBe('AI_NO_TOOLS');
      expect(gateway.requests).toEqual([]);
    });

    it('asks a denomination-wide session to pick a sede first', async () => {
      const { chat } = build();

      await expect(chat.execute(wide, ask('Hola'))).rejects.toThrow(
        'Selecciona una sede',
      );
    });

    it('explains that a key it cannot read must be saved again, and logs it without the key', async () => {
      const { chat, repository, error } = build();
      repository.settings = {
        ...repository.settings!,
        apiKeyCipher: 'v1.mal.cifrado.aqui',
      };

      const failure = await chat
        .execute(treasurer, ask('Hola'))
        .catch((e: unknown) => e);

      expect((failure as { code: string }).code).toBe('AI_KEY_UNREADABLE');
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0][0])).not.toContain(API_KEY);
    });
  });

  describe('when the provider fails', () => {
    it.each([
      ['AUTHENTICATION', BusinessRuleException, 'AI_KEY_REJECTED'],
      ['REJECTED', BusinessRuleException, 'AI_REQUEST_REJECTED'],
    ] as const)(
      'maps %s to a clear answer for the sede',
      async (kind, type, code) => {
        const { chat, gateway } = build();
        gateway.enqueue(
          new AiProviderError(kind, 'detalle interno del proveedor'),
        );

        const failure = await chat
          .execute(treasurer, ask('Hola'))
          .catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(type);
        expect((failure as { code: string }).code).toBe(code);
        expect((failure as Error).message).not.toContain('detalle interno');
      },
    );

    it.each(['RATE_LIMITED', 'UNAVAILABLE'] as const)(
      'maps %s to "try again in a few minutes"',
      async (kind) => {
        const { chat, gateway } = build();
        gateway.enqueue(new AiProviderError(kind, 'x'));

        await expect(
          chat.execute(treasurer, ask('Hola')),
        ).rejects.toBeInstanceOf(ServiceUnavailableDomainException);
      },
    );

    it('lets an unexpected error through to be handled as a server error', async () => {
      const { chat } = build();

      await expect(chat.execute(treasurer, ask('Hola'))).rejects.toThrow(
        'nothing scripted',
      );
    });
  });

  describe('the conversation it accepts', () => {
    it('refuses an empty conversation', async () => {
      const { chat } = build();

      await expect(chat.execute(treasurer, [])).rejects.toBeInstanceOf(
        InvalidInputException,
      );
    });

    it(`refuses more than ${AI_CHAT_MAX_MESSAGES} messages`, async () => {
      const { chat } = build();
      const many = Array.from(
        { length: AI_CHAT_MAX_MESSAGES + 1 },
        (_, index) => ({
          role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: 'x',
        }),
      );

      await expect(chat.execute(treasurer, many)).rejects.toBeInstanceOf(
        InvalidInputException,
      );
    });

    it('refuses a conversation that does not end with a message of the user', async () => {
      const { chat } = build();

      await expect(
        chat.execute(treasurer, [
          { role: 'user', content: 'Hola' },
          { role: 'assistant', content: 'Hola' },
        ]),
      ).rejects.toThrow('último mensaje');
    });

    it.each([[''], ['   '], ['x'.repeat(AI_CHAT_MAX_MESSAGE_CHARS + 1)]])(
      'refuses a message of %j characters',
      async (content) => {
        const { chat } = build();

        await expect(
          chat.execute(treasurer, ask(content)),
        ).rejects.toBeInstanceOf(InvalidInputException);
      },
    );

    it('accepts a long answer of the assistant in the history, but not a long question', async () => {
      const { chat, gateway } = build();
      gateway.enqueue(answer('ok'));
      const longAnswer = 'x'.repeat(AI_CHAT_MAX_MESSAGE_CHARS + 500);

      await expect(
        chat.execute(treasurer, [
          { role: 'user', content: 'Hola' },
          { role: 'assistant', content: longAnswer },
          { role: 'user', content: 'Sigue' },
        ]),
      ).resolves.toBeDefined();
      await expect(
        chat.execute(treasurer, [{ role: 'user', content: longAnswer }]),
      ).rejects.toBeInstanceOf(InvalidInputException);
    });

    it('refuses an answer of the assistant that is absurdly long', async () => {
      const { chat } = build();

      await expect(
        chat.execute(treasurer, [
          { role: 'user', content: 'Hola' },
          {
            role: 'assistant',
            content: 'x'.repeat(AI_CHAT_MAX_ASSISTANT_CHARS + 1),
          },
          { role: 'user', content: 'Sigue' },
        ]),
      ).rejects.toBeInstanceOf(InvalidInputException);
    });

    it('does not call the provider when the conversation is wrong', async () => {
      const { chat, gateway } = build();

      await chat.execute(treasurer, []).catch(() => undefined);

      expect(gateway.requests).toEqual([]);
    });
  });
});

describe('GetAiChatStatusUseCase', () => {
  it('is available when the sede turned it on, has a key, and the person has tools', async () => {
    const { status } = build();

    expect(await status.execute(treasurer)).toEqual({
      available: true,
      reason: null,
      model: 'claude-sonnet-5-5',
      tools: [{ name: 'resumen_financiero', title: 'Resumen financiero' }],
    });
  });

  it('says why it is not available', async () => {
    expect((await build({ on: false }).status.execute(treasurer)).reason).toBe(
      'DISABLED',
    );
    expect(
      (await build({ withKey: false }).status.execute(treasurer)).reason,
    ).toBe('NO_KEY');
    expect(
      (
        await build().status.execute(
          buildTenantContext({ permissions: ['ai.use'] }),
        )
      ).reason,
    ).toBe('NO_TOOLS');
  });

  it('answers that a sede that never configured it is off', async () => {
    const repository = new InMemoryAiSettings();
    const status = new GetAiChatStatusUseCase(
      repository,
      new AiToolCatalog([finanzas], {
        error: vi.fn(),
      } as unknown as SmartLogger),
    );

    expect(await status.execute(treasurer)).toMatchObject({
      available: false,
      reason: 'DISABLED',
      model: 'claude-opus-5-5',
    });
  });

  it('never carries the key', async () => {
    const { status } = build();

    expect(JSON.stringify(await status.execute(treasurer))).not.toContain(
      'sk-ant',
    );
  });
});
