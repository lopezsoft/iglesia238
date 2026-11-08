import Anthropic from '@anthropic-ai/sdk';
import { AiProviderError } from '../application/ports/ai-assistant.ports.js';
import type { AiGatewayRequest } from '../application/ports/ai-assistant.ports.js';
import { AnthropicGateway, toProviderError } from './anthropic-gateway.js';

const failure = (status: number) =>
  Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type: 'x', message: 'detalle interno' } },
    'detalle interno',
    new Headers(),
  );

const REQUEST: AiGatewayRequest = {
  apiKey: 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
  model: 'claude-sonnet-5-5',
  system: 'Eres un asistente.',
  conversation: [
    { kind: 'text', role: 'user', text: '¿Cuánto entró?' },
    {
      kind: 'turn',
      turn: {
        stopReason: 'tool_use',
        text: '',
        toolCalls: [{ id: 'toolu_1', name: 'resumen_financiero', input: {} }],
        replay: [
          { type: 'thinking', thinking: '', signature: 'firma' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'resumen_financiero',
            input: {},
          },
        ],
        inputTokens: 1,
        outputTokens: 1,
      },
    },
    {
      kind: 'tool-results',
      results: [
        { callId: 'toolu_1', content: '{"ingresos":1}', isError: false },
      ],
    },
  ],
  tools: [
    {
      name: 'resumen_financiero',
      description: 'Ingresos y egresos',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
  maxTokens: 4096,
};

function usage() {
  return { input_tokens: 120, output_tokens: 45 };
}

describe('toProviderError', () => {
  it.each([
    [401, 'AUTHENTICATION'],
    [403, 'AUTHENTICATION'],
    [429, 'RATE_LIMITED'],
    [400, 'REJECTED'],
    [404, 'REJECTED'],
    [422, 'REJECTED'],
    [500, 'UNAVAILABLE'],
    [529, 'UNAVAILABLE'],
  ] as const)('reads a %i from the provider as %s', (status, kind) => {
    const mapped = toProviderError(failure(status));

    expect(mapped).toBeInstanceOf(AiProviderError);
    expect(mapped.kind).toBe(kind);
  });

  it('reads a network failure as the provider being unavailable', () => {
    expect(toProviderError(new Error('socket hang up')).kind).toBe(
      'UNAVAILABLE',
    );
  });

  it('never carries the text of the provider to the person', () => {
    expect(toProviderError(failure(400)).message).not.toContain(
      'detalle interno',
    );
  });
});

describe('AnthropicGateway', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('send', () => {
    it('translates the conversation, the tools and the effort into one request', async () => {
      const create = vi
        .spyOn(Anthropic.Messages.prototype, 'create')
        .mockResolvedValue({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Entraron $1.' }],
          usage: usage(),
        } as never);

      await new AnthropicGateway().send(REQUEST);

      const body = create.mock.calls[0][0] as unknown as Record<
        string,
        unknown
      >;
      expect(body).toMatchObject({
        model: 'claude-sonnet-5-5',
        max_tokens: 4096,
        system: 'Eres un asistente.',
        output_config: { effort: 'low' },
        tools: [
          {
            name: 'resumen_financiero',
            description: 'Ingresos y egresos',
            input_schema: { type: 'object' },
          },
        ],
      });
      expect(body.messages).toEqual([
        { role: 'user', content: '¿Cuánto entró?' },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: '', signature: 'firma' },
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'resumen_financiero',
              input: {},
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: '{"ingresos":1}',
              is_error: false,
            },
          ],
        },
      ]);
    });

    it('sends nothing but the request: no prefill and no forced tool', async () => {
      const create = vi
        .spyOn(Anthropic.Messages.prototype, 'create')
        .mockResolvedValue({
          stop_reason: 'end_turn',
          content: [],
          usage: usage(),
        } as never);

      await new AnthropicGateway().send(REQUEST);

      const body = create.mock.calls[0][0] as unknown as Record<
        string,
        unknown
      >;
      expect(body).not.toHaveProperty('tool_choice');
      expect(body).not.toHaveProperty('temperature');
      expect(body).not.toHaveProperty('thinking');
    });

    it('reads the text, the tool calls and the usage of the answer, and keeps the blocks to replay them', async () => {
      const content = [
        { type: 'thinking', thinking: '', signature: 'firma' },
        { type: 'text', text: 'Voy a consultar.' },
        { type: 'text', text: 'Un momento.' },
        {
          type: 'tool_use',
          id: 'toolu_2',
          name: 'resumen_financiero',
          input: { desde: '2026-01-01' },
        },
      ];
      vi.spyOn(Anthropic.Messages.prototype, 'create').mockResolvedValue({
        stop_reason: 'tool_use',
        content,
        usage: usage(),
      } as never);

      const turn = await new AnthropicGateway().send(REQUEST);

      expect(turn).toEqual({
        stopReason: 'tool_use',
        text: 'Voy a consultar.\nUn momento.',
        toolCalls: [
          {
            id: 'toolu_2',
            name: 'resumen_financiero',
            input: { desde: '2026-01-01' },
          },
        ],
        replay: content,
        inputTokens: 120,
        outputTokens: 45,
      });
    });

    it.each([
      ['end_turn', 'end_turn'],
      ['max_tokens', 'max_tokens'],
      ['refusal', 'refusal'],
      ['pause_turn', 'other'],
      [null, 'other'],
    ])('reads the stop reason %j as %s', async (reason, expected) => {
      vi.spyOn(Anthropic.Messages.prototype, 'create').mockResolvedValue({
        stop_reason: reason,
        content: [],
        usage: usage(),
      } as never);

      expect((await new AnthropicGateway().send(REQUEST)).stopReason).toBe(
        expected,
      );
    });

    it('turns the failures of the provider into errors the application understands', async () => {
      vi.spyOn(Anthropic.Messages.prototype, 'create').mockRejectedValue(
        failure(401),
      );

      await expect(new AnthropicGateway().send(REQUEST)).rejects.toMatchObject({
        kind: 'AUTHENTICATION',
      });
    });
  });

  describe('verifyKey', () => {
    it('asks the provider for one model, which proves the key and costs nothing', async () => {
      const list = vi
        .spyOn(Anthropic.Models.prototype, 'list')
        .mockResolvedValue({} as never);

      await new AnthropicGateway().verifyKey(REQUEST.apiKey);

      expect(list).toHaveBeenCalledWith({ limit: 1 });
    });

    it('reports a key the provider rejects', async () => {
      vi.spyOn(Anthropic.Models.prototype, 'list').mockRejectedValue(
        failure(401),
      );

      await expect(
        new AnthropicGateway().verifyKey(REQUEST.apiKey),
      ).rejects.toMatchObject({
        kind: 'AUTHENTICATION',
      });
    });
  });
});
