import { HttpException, Inject, Injectable } from '@nestjs/common';
import { SmartLogger } from '../../../../common/logging/smart-logger.service.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import type { AiToolSpec } from '../ports/ai-assistant.ports.js';
import { AI_TOOLS, type AiTool } from './ai-tool.js';

/** A tool answer is read by a model: more than this is noise that costs the sede money. */
export const MAX_TOOL_OUTPUT_CHARS = 20_000;

export interface AiToolOutcome {
  readonly content: string;
  readonly isError: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The tools the assistant can use, for a chat and for an MCP connection alike. Each tool is offered only to who holds
 * the permission of its screen, and runs with the context of that person (or of the connection), so the assistant
 * never sees more than the one asking.
 */
@Injectable()
export class AiToolCatalog {
  constructor(
    @Inject(AI_TOOLS) private readonly tools: readonly AiTool[],
    private readonly logger: SmartLogger,
  ) {}

  /** The permissions of every tool: what a connection token holds, and nothing else. */
  allPermissions(): readonly string[] {
    return [...new Set(this.tools.map((tool) => tool.permission))];
  }

  availableTo(tenant: TenantContext): readonly AiTool[] {
    return this.tools.filter((tool) => tenant.has(tool.permission));
  }

  specsFor(tenant: TenantContext): AiToolSpec[] {
    return this.availableTo(tenant).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  titleOf(name: string): string {
    return this.tools.find((tool) => tool.name === name)?.title ?? name;
  }

  /** Runs a tool. A failure is an answer for the model (it can correct itself), never an exception for the caller. */
  async execute(
    tenant: TenantContext,
    name: string,
    input: unknown,
  ): Promise<AiToolOutcome> {
    const tool = this.availableTo(tenant).find(
      (candidate) => candidate.name === name,
    );
    if (!tool) {
      return {
        content:
          'Esa herramienta no existe o no está disponible para este usuario.',
        isError: true,
      };
    }
    if (input !== undefined && input !== null && !isRecord(input)) {
      return {
        content: 'Los argumentos de la herramienta deben ser un objeto.',
        isError: true,
      };
    }
    try {
      const result = await tool.run(tenant, input ?? {});
      return { content: this.serialize(result), isError: false };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        return { content: error.message, isError: true };
      }
      this.logger.error(
        `AI tool ${tool.name} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {
        content: 'La consulta falló. Intenta de nuevo más tarde.',
        isError: true,
      };
    }
  }

  private serialize(result: unknown): string {
    const text = JSON.stringify(result);
    return text.length > MAX_TOOL_OUTPUT_CHARS
      ? `${text.slice(0, MAX_TOOL_OUTPUT_CHARS)}… [respuesta recortada: pide un rango más corto]`
      : text;
  }
}
