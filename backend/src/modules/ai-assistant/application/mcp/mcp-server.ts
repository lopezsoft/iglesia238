import { Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { AiToolCatalog } from '../tools/ai-tool-catalog.js';

/** Protocol versions this server speaks, newest first. The client's is echoed back when it is one of these. */
export const MCP_PROTOCOL_VERSIONS = [
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;

const SERVER_INFO = { name: 'iglesia238', title: 'Iglesia 238' } as const;
const INSTRUCTIONS =
  'Datos agregados de una sede de Iglesia 238 (finanzas, diezmos, asistencia y membresía), en solo lectura. ' +
  'Los montos están en pesos colombianos (COP). Ninguna herramienta entrega datos personales.';

/** JSON-RPC 2.0 error codes the protocol uses. */
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

type JsonRpcId = string | number | null;

interface JsonRpcError {
  readonly code: number;
  readonly message: string;
}

export type JsonRpcResponse =
  | {
      readonly jsonrpc: '2.0';
      readonly id: JsonRpcId;
      readonly result: unknown;
    }
  | {
      readonly jsonrpc: '2.0';
      readonly id: JsonRpcId;
      readonly error: JsonRpcError;
    };

/** What the transport does with the answer: nothing to send (a notification), or a body. */
export type McpReply =
  | { readonly kind: 'none' }
  | { readonly kind: 'single'; readonly body: JsonRpcResponse }
  | { readonly kind: 'batch'; readonly body: readonly JsonRpcResponse[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(
  id: JsonRpcId,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/**
 * The part of the Model Context Protocol an assistant needs to offer tools: `initialize`, `ping`, `tools/list` and
 * `tools/call`, over stateless requests (Streamable HTTP, one JSON answer per request). It holds no session: the
 * connection token authenticates every request, and each one runs with the context the token stands for.
 */
@Injectable()
export class McpServer {
  constructor(private readonly catalog: AiToolCatalog) {}

  async handle(tenant: TenantContext, payload: unknown): Promise<McpReply> {
    if (Array.isArray(payload)) {
      if (payload.length === 0) {
        return {
          kind: 'single',
          body: failure(null, INVALID_REQUEST, 'Lote vacío.'),
        };
      }
      const answers: JsonRpcResponse[] = [];
      for (const item of payload) {
        const answer = await this.handleOne(tenant, item);
        if (answer) {
          answers.push(answer);
        }
      }
      return answers.length > 0
        ? { kind: 'batch', body: answers }
        : { kind: 'none' };
    }
    const answer = await this.handleOne(tenant, payload);
    return answer ? { kind: 'single', body: answer } : { kind: 'none' };
  }

  parseError(): McpReply {
    return {
      kind: 'single',
      body: failure(null, PARSE_ERROR, 'El cuerpo no es JSON válido.'),
    };
  }

  private async handleOne(
    tenant: TenantContext,
    message: unknown,
  ): Promise<JsonRpcResponse | null> {
    if (
      !isRecord(message) ||
      message.jsonrpc !== '2.0' ||
      typeof message.method !== 'string'
    ) {
      // A response or a malformed message: nothing to answer unless it carried an id.
      return isRecord(message) && 'result' in message
        ? null
        : failure(null, INVALID_REQUEST, 'Mensaje JSON-RPC inválido.');
    }
    const hasId = 'id' in message;
    const id = this.idOf(message.id);
    if (hasId && id === undefined) {
      return failure(
        null,
        INVALID_REQUEST,
        'El id debe ser texto, número o null.',
      );
    }
    // A message without id is a notification: it never gets an answer.
    if (!hasId) {
      return null;
    }
    const requestId = id ?? null;
    const params = isRecord(message.params) ? message.params : {};

    switch (message.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: requestId,
          result: this.initialize(params),
        };
      case 'ping':
        return { jsonrpc: '2.0', id: requestId, result: {} };
      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: requestId,
          result: {
            tools: this.catalog.availableTo(tenant).map((tool) => ({
              name: tool.name,
              title: tool.title,
              description: tool.description,
              inputSchema: tool.inputSchema,
              annotations: { readOnlyHint: true, openWorldHint: false },
            })),
          },
        };
      case 'tools/call':
        return this.callTool(tenant, requestId, params);
      default:
        return failure(
          requestId,
          METHOD_NOT_FOUND,
          `Método no soportado: ${message.method}`,
        );
    }
  }

  private idOf(value: unknown): JsonRpcId | undefined {
    return typeof value === 'string' ||
      typeof value === 'number' ||
      value === null
      ? value
      : undefined;
  }

  private initialize(params: Record<string, unknown>) {
    const requested =
      typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
    const supported = MCP_PROTOCOL_VERSIONS.find(
      (version) => version === requested,
    );
    return {
      protocolVersion: supported ?? MCP_PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
    };
  }

  private async callTool(
    tenant: TenantContext,
    id: JsonRpcId,
    params: Record<string, unknown>,
  ): Promise<JsonRpcResponse> {
    if (typeof params.name !== 'string' || params.name === '') {
      return failure(id, INVALID_PARAMS, 'Falta el nombre de la herramienta.');
    }
    const outcome = await this.catalog.execute(
      tenant,
      params.name,
      params.arguments,
    );
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: outcome.content }],
        isError: outcome.isError,
      },
    };
  }
}
