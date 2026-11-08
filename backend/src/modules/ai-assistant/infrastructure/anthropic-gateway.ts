import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import {
  AiProviderError,
  type AiConversationItem,
  type AiGateway,
  type AiGatewayRequest,
  type AiStopReason,
  type AiTurn,
} from '../application/ports/ai-assistant.ports.js';

/** A consultation that takes longer than this is not going to finish: the person is waiting in a chat. */
const REQUEST_TIMEOUT_MS = 90_000;

function clientFor(apiKey: string): Anthropic {
  // The key belongs to the sede that sent the request: one client per call, nothing shared between sedes.
  return new Anthropic({ apiKey, maxRetries: 1, timeout: REQUEST_TIMEOUT_MS });
}

/** What the provider's failures mean for the application. */
export function toProviderError(error: unknown): AiProviderError {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AiProviderError(
      'AUTHENTICATION',
      'The provider rejected the key',
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError(
      'RATE_LIMITED',
      'The provider limited the account',
    );
  }
  if (
    error instanceof Anthropic.BadRequestError ||
    error instanceof Anthropic.NotFoundError ||
    error instanceof Anthropic.UnprocessableEntityError
  ) {
    return new AiProviderError('REJECTED', 'The provider rejected the request');
  }
  return new AiProviderError('UNAVAILABLE', 'The provider could not answer');
}

function stopReasonOf(reason: string | null): AiStopReason {
  switch (reason) {
    case 'end_turn':
    case 'tool_use':
    case 'max_tokens':
    case 'refusal':
      return reason;
    default:
      return 'other';
  }
}

function toMessages(
  conversation: readonly AiConversationItem[],
): Anthropic.MessageParam[] {
  return conversation.map((item): Anthropic.MessageParam => {
    switch (item.kind) {
      case 'text':
        return { role: item.role, content: item.text };
      case 'turn':
        // The blocks of the previous answer go back exactly as they came (thinking included).
        return {
          role: 'assistant',
          content: item.turn.replay as Anthropic.ContentBlock[],
        };
      case 'tool-results':
        return {
          role: 'user',
          content: item.results.map(
            (result): Anthropic.ToolResultBlockParam => ({
              type: 'tool_result',
              tool_use_id: result.callId,
              content: result.content,
              is_error: result.isError,
            }),
          ),
        };
    }
  });
}

/** Claude through the official SDK. The key arrives with each request: the sede owns it, the system only borrows it. */
@Injectable()
export class AnthropicGateway implements AiGateway {
  async verifyKey(apiKey: string): Promise<void> {
    try {
      await clientFor(apiKey).models.list({ limit: 1 });
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async send(request: AiGatewayRequest): Promise<AiTurn> {
    try {
      const response = await clientFor(request.apiKey).messages.create({
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        // Answering from figures does not need long reasoning: low effort keeps the bill of the sede small.
        output_config: { effort: 'low' },
        tools: request.tools.map((tool): Anthropic.Tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
        })),
        messages: toMessages(request.conversation),
      });
      return {
        stopReason: stopReasonOf(response.stop_reason),
        text: response.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('\n'),
        toolCalls: response.content.flatMap((block) =>
          block.type === 'tool_use'
            ? [{ id: block.id, name: block.name, input: block.input }]
            : [],
        ),
        replay: response.content,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (error) {
      throw toProviderError(error);
    }
  }
}
