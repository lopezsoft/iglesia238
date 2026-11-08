import { Inject, Injectable } from '@nestjs/common';
import { UnauthenticatedException } from '../../../../common/errors/domain.exception.js';
import { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { hashAiToken, looksLikeAiToken } from '../ai-access-token.js';
import {
  AI_SETTINGS_REPOSITORY,
  type AiSettingsRepository,
} from '../ports/ai-assistant.ports.js';
import { AiToolCatalog } from '../tools/ai-tool-catalog.js';

/** How often a token's "last used" is written: it is for people to read, not worth a write per request. */
const TOUCH_EVERY_MS = 60_000;

/**
 * Who a connection token stands for. It never says why it refused (unknown, revoked, expired, switched off): every
 * failure is the same 401, so a guessed token teaches nothing. A valid token acts as a context of its sede that holds
 * only the permissions of the read-only tools, so it can reach nothing else.
 */
@Injectable()
export class AuthenticateMcpTokenUseCase {
  constructor(
    @Inject(AI_SETTINGS_REPOSITORY)
    private readonly repository: AiSettingsRepository,
    private readonly catalog: AiToolCatalog,
    private readonly clock: Clock,
  ) {}

  async execute(rawToken: string | undefined): Promise<TenantContext> {
    if (rawToken === undefined || !looksLikeAiToken(rawToken)) {
      throw new UnauthenticatedException();
    }
    const record = await this.repository.findTokenByHash(hashAiToken(rawToken));
    const now = this.clock.now();
    if (
      !record ||
      record.revokedAt !== null ||
      (record.expiresAt !== null &&
        record.expiresAt.getTime() <= now.getTime()) ||
      !record.mcpEnabled ||
      !record.congregationActive
    ) {
      throw new UnauthenticatedException();
    }
    if (
      record.lastUsedAt === null ||
      now.getTime() - record.lastUsedAt.getTime() >= TOUCH_EVERY_MS
    ) {
      // The connection works even if this bookkeeping write fails.
      await this.repository.touchToken(record.id, now).catch(() => undefined);
    }
    return new TenantContext({
      userId: record.createdById,
      sessionId: `mcp:${record.id}`,
      scopeKey: `C:${record.congregationId}`,
      kind: 'CONGREGATION',
      denominationId: record.denominationId,
      congregationId: record.congregationId,
      roleCodes: [],
      permissions: new Set(this.catalog.allPermissions()),
    });
  }
}
