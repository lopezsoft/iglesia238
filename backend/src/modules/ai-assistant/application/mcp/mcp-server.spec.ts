import { buildTenantContext } from '../../../../../test/support/tenants.js';
import type { SmartLogger } from '../../../../common/logging/smart-logger.service.js';
import type { AiTool } from '../tools/ai-tool.js';
import { AiToolCatalog } from '../tools/ai-tool-catalog.js';
import {
  MCP_PROTOCOL_VERSIONS,
  McpServer,
  type McpReply,
} from './mcp-server.js';

const finanzas: AiTool = {
  name: 'resumen_financiero',
  title: 'Resumen financiero',
  description: 'Ingresos y egresos',
  inputSchema: {
    type: 'object',
    properties: { desde: { type: 'string' } },
    required: ['desde'],
  },
  permission: 'reports.read',
  run: (_tenant, input) => Promise.resolve({ recibido: input }),
};
const asistencia: AiTool = {
  ...finanzas,
  name: 'estadisticas_asistencia',
  title: 'Asistencia',
  permission: 'attendance.write',
};

function build() {
  const catalog = new AiToolCatalog([finanzas, asistencia], {
    error: vi.fn(),
  } as unknown as SmartLogger);
  return new McpServer(catalog);
}

const connection = buildTenantContext({
  permissions: ['reports.read', 'attendance.write'],
});
const onlyFinance = buildTenantContext({ permissions: ['reports.read'] });

function single(reply: McpReply) {
  if (reply.kind !== 'single') {
    throw new Error(`expected a single reply, got ${reply.kind}`);
  }
  return reply.body;
}

describe('McpServer', () => {
  describe('initialize', () => {
    it('answers with the protocol it speaks, its tools capability and who it is', async () => {
      const reply = single(
        await build().handle(connection, {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'cliente', version: '1' },
          },
        }),
      );

      expect(reply).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'iglesia238' },
        },
      });
      expect(JSON.stringify(reply)).toContain('COP');
    });

    it('offers its newest version when the client asks for one it does not know', async () => {
      const reply = single(
        await build().handle(connection, {
          jsonrpc: '2.0',
          id: 'a',
          method: 'initialize',
          params: { protocolVersion: '1999-01-01' },
        }),
      );

      expect(reply).toMatchObject({
        id: 'a',
        result: { protocolVersion: MCP_PROTOCOL_VERSIONS[0] },
      });
    });

    it('initialises even when the client sends no parameters', async () => {
      const reply = single(
        await build().handle(connection, {
          jsonrpc: '2.0',
          id: 2,
          method: 'initialize',
        }),
      );

      expect(reply).toMatchObject({
        result: { protocolVersion: MCP_PROTOCOL_VERSIONS[0] },
      });
    });
  });

  it('answers ping', async () => {
    expect(
      single(
        await build().handle(connection, {
          jsonrpc: '2.0',
          id: 3,
          method: 'ping',
        }),
      ),
    ).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
  });

  describe('tools/list', () => {
    it('lists the tools with title, description, schema and a read-only mark', async () => {
      const reply = single(
        await build().handle(connection, {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/list',
        }),
      );

      expect(reply).toMatchObject({
        id: 4,
        result: {
          tools: [
            {
              name: 'resumen_financiero',
              title: 'Resumen financiero',
              description: 'Ingresos y egresos',
              inputSchema: { type: 'object' },
              annotations: { readOnlyHint: true },
            },
            { name: 'estadisticas_asistencia' },
          ],
        },
      });
    });

    it('lists only what the context may use', async () => {
      const reply = single(
        await build().handle(onlyFinance, {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/list',
        }),
      );

      const names = (
        reply as { result: { tools: Array<{ name: string }> } }
      ).result.tools.map((tool) => tool.name);
      expect(names).toEqual(['resumen_financiero']);
    });
  });

  describe('tools/call', () => {
    it('runs the tool and returns its answer as text', async () => {
      const reply = single(
        await build().handle(connection, {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'resumen_financiero',
            arguments: { desde: '2026-01-01' },
          },
        }),
      );

      expect(reply).toEqual({
        jsonrpc: '2.0',
        id: 6,
        result: {
          content: [
            { type: 'text', text: '{"recibido":{"desde":"2026-01-01"}}' },
          ],
          isError: false,
        },
      });
    });

    it('marks as error, inside the result, a tool the context cannot use', async () => {
      const reply = single(
        await build().handle(onlyFinance, {
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: { name: 'estadisticas_asistencia', arguments: {} },
        }),
      );

      expect(reply).toMatchObject({ id: 7, result: { isError: true } });
    });

    it('answers a protocol error when the name is missing', async () => {
      const reply = single(
        await build().handle(connection, {
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: {},
        }),
      );

      expect(reply).toMatchObject({ id: 8, error: { code: -32602 } });
    });
  });

  it('does not answer a notification', async () => {
    expect(
      await build().handle(connection, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    ).toEqual({ kind: 'none' });
  });

  it('says it does not know a method, keeping the id of the request', async () => {
    const reply = single(
      await build().handle(connection, {
        jsonrpc: '2.0',
        id: 9,
        method: 'resources/list',
      }),
    );

    expect(reply).toMatchObject({ id: 9, error: { code: -32601 } });
  });

  it.each([
    ['text', 'hola'],
    ['a number', 7],
    [
      'a message with another version',
      { jsonrpc: '1.0', id: 1, method: 'ping' },
    ],
    ['a message without method', { jsonrpc: '2.0', id: 1 }],
    ['a method that is not text', { jsonrpc: '2.0', id: 1, method: 5 }],
  ])('rejects %s as an invalid request', async (_label, payload) => {
    const reply = single(await build().handle(connection, payload));

    expect(reply).toMatchObject({ id: null, error: { code: -32600 } });
  });

  it('rejects an id that is not text, a number or null', async () => {
    const reply = single(
      await build().handle(connection, {
        jsonrpc: '2.0',
        id: { dentro: true },
        method: 'ping',
      }),
    );

    expect(reply).toMatchObject({ error: { code: -32600 } });
  });

  it('ignores a response that a client sends back', async () => {
    expect(
      await build().handle(connection, { jsonrpc: '2.0', id: 1, result: {} }),
    ).toEqual({ kind: 'none' });
  });

  describe('batches', () => {
    it('answers each request of the batch and skips the notifications', async () => {
      const reply = await build().handle(connection, [
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ]);

      expect(reply.kind).toBe('batch');
      expect(
        (reply as Extract<McpReply, { kind: 'batch' }>).body.map(
          (answer) => answer.id,
        ),
      ).toEqual([1, 2]);
    });

    it('answers nothing for a batch of notifications', async () => {
      expect(
        await build().handle(connection, [
          { jsonrpc: '2.0', method: 'notifications/initialized' },
        ]),
      ).toEqual({ kind: 'none' });
    });

    it('rejects an empty batch', async () => {
      expect(single(await build().handle(connection, []))).toMatchObject({
        error: { code: -32600 },
      });
    });
  });

  it('tells a body that is not JSON', () => {
    expect(single(build().parseError())).toMatchObject({
      error: { code: -32700 },
    });
  });
});
