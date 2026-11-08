import { Inject, Injectable } from '@nestjs/common';
import { requireCongregationScope } from '../../../../common/accounting/congregation-scope.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import {
  BusinessRuleException,
  InvalidInputException,
  NotFoundDomainException,
  ServiceUnavailableDomainException,
} from '../../../../common/errors/domain.exception.js';
import {
  toIsoDateTime,
  toIsoDateTimeOrNull,
} from '../../../../common/mappers/value-mappers.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { generateAiToken } from '../ai-access-token.js';
import {
  AI_MODELS,
  AI_PROVIDER,
  DEFAULT_AI_MODEL,
  isSupportedAiModel,
} from '../ai-models.js';
import type {
  AiSettingsView,
  AiTokenRecord,
  AiTokenView,
  CreatedAiToken,
} from '../ai-settings.models.js';
import {
  AI_GATEWAY,
  AI_SECRET_CIPHER,
  AI_SETTINGS_REPOSITORY,
  AiProviderError,
  type AiGateway,
  type AiSecretCipher,
  type AiSedeRecord,
  type AiSettingsRepository,
} from '../ports/ai-assistant.ports.js';

/** Where an external AI tool connects, built from the public address of the app. */
export const AI_MCP_URL = Symbol('AI_MCP_URL');

const SEDE_ACTION = 'configurar el asistente de IA';
export const MAX_ACTIVE_AI_TOKENS = 10;
const TOKEN_NAME_MAX = 80;
const MAX_TOKEN_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Anthropic keys look like sk-ant-api03-…; the check only stops obvious mistakes before the provider is asked. */
const API_KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

function tokenView(record: AiTokenRecord, now: Date): AiTokenView {
  return {
    id: record.id,
    name: record.name,
    tokenPrefix: record.tokenPrefix,
    createdByName: record.createdByName,
    createdAt: toIsoDateTime(record.createdAt),
    lastUsedAt: toIsoDateTimeOrNull(record.lastUsedAt),
    expiresAt: toIsoDateTimeOrNull(record.expiresAt),
    revokedAt: toIsoDateTimeOrNull(record.revokedAt),
    active:
      record.revokedAt === null &&
      (record.expiresAt === null || record.expiresAt.getTime() > now.getTime()),
  };
}

async function requireSede(
  repository: AiSettingsRepository,
  tenant: TenantContext,
): Promise<{
  sede: AiSedeRecord;
  scope: ReturnType<typeof requireCongregationScope>;
}> {
  const scope = requireCongregationScope(tenant, SEDE_ACTION);
  const sede = await repository.findSede(scope);
  if (!sede) {
    throw new NotFoundDomainException('La sede no existe.');
  }
  return { sede, scope };
}

@Injectable()
export class GetAiSettingsUseCase {
  constructor(
    @Inject(AI_SETTINGS_REPOSITORY)
    private readonly repository: AiSettingsRepository,
    @Inject(AI_MCP_URL) private readonly mcpUrl: string,
    private readonly clock: Clock,
  ) {}

  async execute(tenant: TenantContext): Promise<AiSettingsView> {
    const { sede, scope } = await requireSede(this.repository, tenant);
    const tokens = await this.repository.listTokens(scope);
    const now = this.clock.now();
    const settings = sede.settings;
    return {
      congregationId: sede.congregationId,
      congregationName: sede.congregationName,
      chatEnabled: settings?.chatEnabled ?? false,
      mcpEnabled: settings?.mcpEnabled ?? false,
      provider: settings?.provider ?? AI_PROVIDER,
      model: settings?.model ?? DEFAULT_AI_MODEL,
      models: AI_MODELS,
      keyConfigured: settings?.apiKeyCipher != null,
      keyLast4: settings?.apiKeyLast4 ?? null,
      mcpUrl: this.mcpUrl,
      tokens: tokens.map((token) => tokenView(token, now)),
    };
  }
}

export interface UpdateAiSettingsInput {
  readonly chatEnabled?: boolean;
  readonly mcpEnabled?: boolean;
  readonly model?: string;
}

/** Turns the chat and the MCP connections on or off for the sede and picks the model of the chat. */
@Injectable()
export class UpdateAiSettingsUseCase {
  constructor(
    @Inject(AI_SETTINGS_REPOSITORY)
    private readonly repository: AiSettingsRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly view: GetAiSettingsUseCase,
  ) {}

  async execute(
    tenant: TenantContext,
    input: UpdateAiSettingsInput,
    ipAddress: string | null = null,
  ): Promise<AiSettingsView> {
    const { sede, scope } = await requireSede(this.repository, tenant);
    if (input.model !== undefined && !isSupportedAiModel(input.model)) {
      throw new InvalidInputException(
        'Elige uno de los modelos de la lista.',
        'INVALID_AI_MODEL',
      );
    }
    const current = sede.settings;
    if (input.chatEnabled === true && current?.apiKeyCipher == null) {
      throw new BusinessRuleException(
        'Para activar el chat primero guarda la clave de IA de la sede.',
        'AI_KEY_REQUIRED',
      );
    }
    const before = {
      chatEnabled: current?.chatEnabled ?? false,
      mcpEnabled: current?.mcpEnabled ?? false,
      model: current?.model ?? DEFAULT_AI_MODEL,
    };
    const after = {
      chatEnabled: input.chatEnabled ?? before.chatEnabled,
      mcpEnabled: input.mcpEnabled ?? before.mcpEnabled,
      model: input.model ?? before.model,
    };
    const changes = buildAuditChanges(before, after, [
      'chatEnabled',
      'mcpEnabled',
      'model',
    ]);
    if (Object.keys(changes).length > 0) {
      await this.transactions.run(async (transaction) => {
        const saved = await this.repository.saveSettings(
          scope,
          after,
          tenant.userId,
          transaction,
        );
        await this.audit.record(
          {
            action: 'AI_SETTINGS_UPDATED',
            entity: 'CongregationAiSettings',
            entityId: saved.id,
            actor: tenant,
            congregationId: sede.congregationId,
            changes,
            ipAddress,
          },
          transaction,
        );
      });
    }
    return this.view.execute(tenant);
  }
}

/** Saves the key of the sede, after the provider confirms that it works. It is stored encrypted and never shown again. */
@Injectable()
export class SaveAiKeyUseCase {
  constructor(
    @Inject(AI_SETTINGS_REPOSITORY)
    private readonly repository: AiSettingsRepository,
    @Inject(AI_SECRET_CIPHER) private readonly cipher: AiSecretCipher,
    @Inject(AI_GATEWAY) private readonly gateway: AiGateway,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly view: GetAiSettingsUseCase,
  ) {}

  async execute(
    tenant: TenantContext,
    apiKey: string,
    ipAddress: string | null = null,
  ): Promise<AiSettingsView> {
    const { sede, scope } = await requireSede(this.repository, tenant);
    const key = apiKey.trim();
    if (!API_KEY_PATTERN.test(key)) {
      throw new InvalidInputException(
        'La clave no tiene el formato esperado: empieza con sk-ant- y se copia completa desde la consola de Anthropic.',
        'INVALID_AI_KEY',
      );
    }
    try {
      await this.gateway.verifyKey(key);
    } catch (error) {
      if (error instanceof AiProviderError) {
        if (error.kind === 'AUTHENTICATION') {
          throw new InvalidInputException(
            'Anthropic no aceptó esa clave. Revisa que esté completa y vigente.',
            'INVALID_AI_KEY',
          );
        }
        throw new ServiceUnavailableDomainException(
          'No pudimos comprobar la clave con Anthropic. Intenta de nuevo en unos minutos.',
        );
      }
      throw error;
    }
    const hadKey = sede.settings?.apiKeyCipher != null;
    await this.transactions.run(async (transaction) => {
      const saved = await this.repository.saveSettings(
        scope,
        { apiKey: { cipher: this.cipher.encrypt(key), last4: key.slice(-4) } },
        tenant.userId,
        transaction,
      );
      await this.audit.record(
        {
          action: 'AI_CREDENTIAL_SAVED',
          entity: 'CongregationAiSettings',
          entityId: saved.id,
          actor: tenant,
          congregationId: sede.congregationId,
          changes: { credentialOnFile: { from: hadKey, to: true } },
          ipAddress,
        },
        transaction,
      );
    });
    return this.view.execute(tenant);
  }
}

/** Removes the key and, with it, the chat: a chat without a key cannot work. */
@Injectable()
export class RemoveAiKeyUseCase {
  constructor(
    @Inject(AI_SETTINGS_REPOSITORY)
    private readonly repository: AiSettingsRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly view: GetAiSettingsUseCase,
  ) {}

  async execute(
    tenant: TenantContext,
    ipAddress: string | null = null,
  ): Promise<AiSettingsView> {
    const { sede, scope } = await requireSede(this.repository, tenant);
    if (sede.settings?.apiKeyCipher != null) {
      await this.transactions.run(async (transaction) => {
        const saved = await this.repository.saveSettings(
          scope,
          { apiKey: null, chatEnabled: false },
          tenant.userId,
          transaction,
        );
        await this.audit.record(
          {
            action: 'AI_CREDENTIAL_REMOVED',
            entity: 'CongregationAiSettings',
            entityId: saved.id,
            actor: tenant,
            congregationId: sede.congregationId,
            changes: { credentialOnFile: { from: true, to: false } },
            ipAddress,
          },
          transaction,
        );
      });
    }
    return this.view.execute(tenant);
  }
}

export interface CreateAiTokenInput {
  readonly name: string;
  /** Days until it stops working; omitted, it does not expire. */
  readonly expiresInDays?: number;
}

/** Creates the token an external AI tool uses to connect. The full token is returned once and cannot be read again. */
@Injectable()
export class CreateAiTokenUseCase {
  constructor(
    @Inject(AI_SETTINGS_REPOSITORY)
    private readonly repository: AiSettingsRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    input: CreateAiTokenInput,
    ipAddress: string | null = null,
  ): Promise<CreatedAiToken> {
    const { sede, scope } = await requireSede(this.repository, tenant);
    const name = input.name.trim();
    if (name.length === 0 || name.length > TOKEN_NAME_MAX) {
      throw new InvalidInputException(
        `El nombre de la conexión debe tener entre 1 y ${TOKEN_NAME_MAX} caracteres.`,
      );
    }
    if (
      input.expiresInDays !== undefined &&
      (!Number.isInteger(input.expiresInDays) ||
        input.expiresInDays < 1 ||
        input.expiresInDays > MAX_TOKEN_DAYS)
    ) {
      throw new InvalidInputException(
        `La vigencia debe ser de 1 a ${MAX_TOKEN_DAYS} días.`,
      );
    }
    const now = this.clock.now();
    const existing = (await this.repository.listTokens(scope)).map((token) =>
      tokenView(token, now),
    );
    if (
      existing.filter((token) => token.active).length >= MAX_ACTIVE_AI_TOKENS
    ) {
      throw new BusinessRuleException(
        `Una sede puede tener hasta ${MAX_ACTIVE_AI_TOKENS} conexiones activas: revoca alguna antes de crear otra.`,
        'AI_TOKEN_LIMIT',
      );
    }
    const fresh = generateAiToken();
    const expiresAt =
      input.expiresInDays === undefined
        ? null
        : new Date(now.getTime() + input.expiresInDays * DAY_MS);
    const record = await this.transactions.run(async (transaction) => {
      const created = await this.repository.createToken(
        scope,
        {
          name,
          tokenHash: fresh.hash,
          tokenPrefix: fresh.prefix,
          createdById: tenant.userId,
          expiresAt,
        },
        transaction,
      );
      await this.audit.record(
        {
          action: 'AI_ACCESS_CREATED',
          entity: 'AiAccessToken',
          entityId: created.id,
          actor: tenant,
          congregationId: sede.congregationId,
          changes: buildAuditChanges(null, { connectionName: name }, [
            'connectionName',
          ]),
          ipAddress,
        },
        transaction,
      );
      return created;
    });
    return { ...tokenView(record, now), token: fresh.token };
  }
}

@Injectable()
export class RevokeAiTokenUseCase {
  constructor(
    @Inject(AI_SETTINGS_REPOSITORY)
    private readonly repository: AiSettingsRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    tokenId: number,
    ipAddress: string | null = null,
  ): Promise<void> {
    const { sede, scope } = await requireSede(this.repository, tenant);
    await this.transactions.run(async (transaction) => {
      const revoked = await this.repository.revokeToken(
        scope,
        tokenId,
        this.clock.now(),
        transaction,
      );
      if (!revoked) {
        throw new NotFoundDomainException(
          'La conexión no existe o ya estaba revocada.',
        );
      }
      await this.audit.record(
        {
          action: 'AI_ACCESS_REVOKED',
          entity: 'AiAccessToken',
          entityId: tokenId,
          actor: tenant,
          congregationId: sede.congregationId,
          changes: { revoked: { from: false, to: true } },
          ipAddress,
        },
        transaction,
      );
    });
  }
}
