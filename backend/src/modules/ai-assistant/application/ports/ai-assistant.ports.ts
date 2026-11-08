import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type {
  AiSettingsChanges,
  AiSettingsRecord,
  AiTokenAuthRecord,
  AiTokenRecord,
  NewAiTokenRecord,
} from '../ai-settings.models.js';

export const AI_SETTINGS_REPOSITORY = Symbol('AI_SETTINGS_REPOSITORY');
export const AI_SECRET_CIPHER = Symbol('AI_SECRET_CIPHER');
export const AI_GATEWAY = Symbol('AI_GATEWAY');

/** The sede a request acts on, with its settings if it ever saved any. */
export interface AiSedeRecord {
  readonly congregationId: number;
  readonly congregationName: string;
  readonly settings: AiSettingsRecord | null;
}

/** Persistence of the settings of a sede and of its connection tokens. */
export interface AiSettingsRepository {
  /** Null when the sede does not exist in the denomination of the scope. */
  findSede(scope: TenantScope): Promise<AiSedeRecord | null>;
  /** Creates the row on the first change; returns what was stored. */
  saveSettings(
    scope: TenantScope,
    changes: AiSettingsChanges,
    updatedById: number,
    transaction: Transaction,
  ): Promise<AiSettingsRecord>;
  listTokens(scope: TenantScope): Promise<AiTokenRecord[]>;
  createToken(
    scope: TenantScope,
    data: NewAiTokenRecord,
    transaction: Transaction,
  ): Promise<AiTokenRecord>;
  /** True when a token of the sede was revoked now; false when it does not exist, is not of the sede or was revoked. */
  revokeToken(
    scope: TenantScope,
    tokenId: number,
    now: Date,
    transaction: Transaction,
  ): Promise<boolean>;
  /** Looks a token up by the hash of what the client sent. */
  findTokenByHash(hash: string): Promise<AiTokenAuthRecord | null>;
  touchToken(tokenId: number, now: Date): Promise<void>;
}

/** Encrypts the keys of the providers so a copy of the database does not reveal them. */
export interface AiSecretCipher {
  encrypt(plain: string): string;
  /** Throws when the text was not produced by this cipher or was altered. */
  decrypt(encrypted: string): string;
}

// ---------- The language model, seen from the application ----------

export interface AiToolSpec {
  readonly name: string;
  readonly description: string;
  /** JSON Schema of the input, an object. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface AiToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export interface AiToolResult {
  readonly callId: string;
  readonly content: string;
  readonly isError: boolean;
}

export type AiStopReason =
  'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

/** One answer of the model. `replay` is opaque: it goes back to the provider untouched in the next request. */
export interface AiTurn {
  readonly stopReason: AiStopReason;
  readonly text: string;
  readonly toolCalls: readonly AiToolCall[];
  readonly replay: unknown;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export type AiConversationItem =
  | {
      readonly kind: 'text';
      readonly role: 'user' | 'assistant';
      readonly text: string;
    }
  | { readonly kind: 'turn'; readonly turn: AiTurn }
  | {
      readonly kind: 'tool-results';
      readonly results: readonly AiToolResult[];
    };

export interface AiGatewayRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly system: string;
  readonly conversation: readonly AiConversationItem[];
  readonly tools: readonly AiToolSpec[];
  readonly maxTokens: number;
}

/** Why the provider did not answer, in terms the application can act on. */
export class AiProviderError extends Error {
  constructor(
    readonly kind:
      'AUTHENTICATION' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'REJECTED',
    message: string,
  ) {
    super(message);
  }
}

export interface AiGateway {
  /** Throws AiProviderError('AUTHENTICATION') when the provider rejects the key. */
  verifyKey(apiKey: string): Promise<void>;
  send(request: AiGatewayRequest): Promise<AiTurn>;
}
