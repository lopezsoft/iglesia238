import { AesSecretCipher } from '../infrastructure/aes-secret-cipher.js';
import type {
  AiSettingsChanges,
  AiSettingsRecord,
  AiTokenAuthRecord,
  AiTokenRecord,
  NewAiTokenRecord,
} from '../application/ai-settings.models.js';
import {
  AiProviderError,
  type AiGateway,
  type AiGatewayRequest,
  type AiSedeRecord,
  type AiSettingsRepository,
  type AiTurn,
} from '../application/ports/ai-assistant.ports.js';
import type {
  AuditEntry,
  AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import type {
  Transaction,
  TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';

export const TEST_NOW = new Date('2026-11-08T15:00:00.000Z');

export class FixedClock extends Clock {
  constructor(private current: Date = TEST_NOW) {
    super();
  }
  override now(): Date {
    return this.current;
  }
  override today(): string {
    return '2026-11-08';
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export const transactions: TransactionRunner = {
  run: <T>(work: (transaction: Transaction) => Promise<T>) =>
    work({ kind: 'transaction' }),
};

export class RecordingAudit implements AuditRecorder {
  readonly entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

export const testCipher = new AesSecretCipher({
  secret: 'a-test-secret-with-more-than-32-characters!!',
});

interface StoredToken extends AiTokenAuthRecord {
  readonly name: string;
  readonly tokenHash: string;
  readonly tokenPrefix: string;
  readonly createdAt: Date;
}

/** One sede (id 10, denomination 1) that keeps its settings and tokens in memory. */
export class InMemoryAiSettings implements AiSettingsRepository {
  settings: AiSettingsRecord | null = null;
  readonly tokens: StoredToken[] = [];
  sedeExists = true;
  sedeActive = true;
  touched: number[] = [];
  private nextTokenId = 1;

  findSede(scope: TenantScope): Promise<AiSedeRecord | null> {
    return Promise.resolve(
      this.sedeExists
        ? {
            congregationId: scope.requireCongregationId(),
            congregationName: 'Sede Central',
            settings: this.settings,
          }
        : null,
    );
  }

  saveSettings(
    scope: TenantScope,
    changes: AiSettingsChanges,
  ): Promise<AiSettingsRecord> {
    const current = this.settings;
    this.settings = {
      id: current?.id ?? 1,
      congregationId: scope.requireCongregationId(),
      chatEnabled: changes.chatEnabled ?? current?.chatEnabled ?? false,
      mcpEnabled: changes.mcpEnabled ?? current?.mcpEnabled ?? false,
      provider: current?.provider ?? 'ANTHROPIC',
      model: changes.model ?? current?.model ?? 'claude-opus-5-5',
      apiKeyCipher:
        changes.apiKey === undefined
          ? (current?.apiKeyCipher ?? null)
          : (changes.apiKey?.cipher ?? null),
      apiKeyLast4:
        changes.apiKey === undefined
          ? (current?.apiKeyLast4 ?? null)
          : (changes.apiKey?.last4 ?? null),
    };
    return Promise.resolve(this.settings);
  }

  private toRecord(token: StoredToken): AiTokenRecord {
    return {
      id: token.id,
      name: token.name,
      tokenPrefix: token.tokenPrefix,
      createdByName: 'Marta Gómez',
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt,
    };
  }

  listTokens(scope: TenantScope): Promise<AiTokenRecord[]> {
    return Promise.resolve(
      this.tokens
        .filter(
          (token) => token.congregationId === scope.requireCongregationId(),
        )
        .map((token) => this.toRecord(token)),
    );
  }

  createToken(
    scope: TenantScope,
    data: NewAiTokenRecord,
  ): Promise<AiTokenRecord> {
    const token: StoredToken = {
      id: this.nextTokenId++,
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      createdById: data.createdById,
      expiresAt: data.expiresAt,
      revokedAt: null,
      lastUsedAt: null,
      mcpEnabled: this.settings?.mcpEnabled ?? false,
      congregationActive: this.sedeActive,
      name: data.name,
      tokenHash: data.tokenHash,
      tokenPrefix: data.tokenPrefix,
      createdAt: TEST_NOW,
    };
    this.tokens.push(token);
    return Promise.resolve(this.toRecord(token));
  }

  revokeToken(
    scope: TenantScope,
    tokenId: number,
    now: Date,
  ): Promise<boolean> {
    const index = this.tokens.findIndex(
      (token) =>
        token.id === tokenId &&
        token.congregationId === scope.requireCongregationId() &&
        token.revokedAt === null,
    );
    if (index < 0) {
      return Promise.resolve(false);
    }
    this.tokens[index] = { ...this.tokens[index], revokedAt: now };
    return Promise.resolve(true);
  }

  findTokenByHash(hash: string): Promise<AiTokenAuthRecord | null> {
    const token = this.tokens.find((candidate) => candidate.tokenHash === hash);
    return Promise.resolve(
      token
        ? {
            ...token,
            mcpEnabled: this.settings?.mcpEnabled ?? false,
            congregationActive: this.sedeActive,
          }
        : null,
    );
  }

  touchToken(tokenId: number, now: Date): Promise<void> {
    this.touched.push(tokenId);
    const index = this.tokens.findIndex((token) => token.id === tokenId);
    if (index >= 0) {
      this.tokens[index] = { ...this.tokens[index], lastUsedAt: now };
    }
    return Promise.resolve();
  }
}

/** A provider that answers what the test scripted, in order, and remembers what it was asked. */
export class ScriptedGateway implements AiGateway {
  readonly requests: AiGatewayRequest[] = [];
  readonly verified: string[] = [];
  verifyError: AiProviderError | null = null;
  private readonly script: Array<AiTurn | AiProviderError> = [];

  enqueue(...turns: Array<AiTurn | AiProviderError>): void {
    this.script.push(...turns);
  }

  verifyKey(apiKey: string): Promise<void> {
    this.verified.push(apiKey);
    return this.verifyError
      ? Promise.reject(this.verifyError)
      : Promise.resolve();
  }

  send(request: AiGatewayRequest): Promise<AiTurn> {
    this.requests.push(request);
    const next = this.script.shift();
    if (!next) {
      return Promise.reject(new Error('The gateway has nothing scripted'));
    }
    return next instanceof AiProviderError
      ? Promise.reject(next)
      : Promise.resolve(next);
  }
}

export function answer(text: string, overrides: Partial<AiTurn> = {}): AiTurn {
  return {
    stopReason: 'end_turn',
    text,
    toolCalls: [],
    replay: [{ type: 'text', text }],
    inputTokens: 100,
    outputTokens: 20,
    ...overrides,
  };
}

export function asksForTool(
  name: string,
  input: unknown = {},
  id = `call_${name}`,
): AiTurn {
  return {
    stopReason: 'tool_use',
    text: '',
    toolCalls: [{ id, name, input }],
    replay: [{ type: 'tool_use', id, name, input }],
    inputTokens: 150,
    outputTokens: 30,
  };
}
