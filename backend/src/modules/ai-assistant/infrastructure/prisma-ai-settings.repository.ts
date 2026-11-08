import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import type {
  AiSettingsChanges,
  AiSettingsRecord,
  AiTokenAuthRecord,
  AiTokenRecord,
  NewAiTokenRecord,
} from '../application/ai-settings.models.js';
import type {
  AiSedeRecord,
  AiSettingsRepository,
} from '../application/ports/ai-assistant.ports.js';

const SETTINGS_SELECT = {
  id: true,
  congregationId: true,
  chatEnabled: true,
  mcpEnabled: true,
  provider: true,
  model: true,
  apiKeyCipher: true,
  apiKeyLast4: true,
} as const;

const TOKEN_SELECT = {
  id: true,
  name: true,
  tokenPrefix: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdBy: { select: { displayName: true, email: true } },
} as const;

interface TokenRow {
  id: number;
  name: string;
  tokenPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdBy: { displayName: string | null; email: string };
}

function toTokenRecord(row: TokenRow): AiTokenRecord {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    createdByName: row.createdBy.displayName ?? row.createdBy.email,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

@Injectable()
export class PrismaAiSettingsRepository implements AiSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSede(scope: TenantScope): Promise<AiSedeRecord | null> {
    const row = await this.prisma.congregation.findFirst({
      where: {
        id: scope.requireCongregationId(),
        denominationId: scope.denominationId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        aiSettings: { select: SETTINGS_SELECT, take: 1 },
      },
    });
    return row
      ? {
          congregationId: row.id,
          congregationName: row.name,
          settings: row.aiSettings[0] ?? null,
        }
      : null;
  }

  async saveSettings(
    scope: TenantScope,
    changes: AiSettingsChanges,
    updatedById: number,
    transaction: Transaction,
  ): Promise<AiSettingsRecord> {
    const congregationId = scope.requireCongregationId();
    const data = {
      ...(changes.chatEnabled !== undefined
        ? { chatEnabled: changes.chatEnabled }
        : {}),
      ...(changes.mcpEnabled !== undefined
        ? { mcpEnabled: changes.mcpEnabled }
        : {}),
      ...(changes.model !== undefined ? { model: changes.model } : {}),
      ...(changes.apiKey !== undefined
        ? {
            apiKeyCipher: changes.apiKey?.cipher ?? null,
            apiKeyLast4: changes.apiKey?.last4 ?? null,
          }
        : {}),
      updatedById,
    };
    return clientOf(this.prisma, transaction).congregationAiSettings.upsert({
      where: { congregationId },
      create: {
        denominationId: scope.denominationId,
        congregationId,
        ...data,
      },
      update: data,
      select: SETTINGS_SELECT,
    });
  }

  async listTokens(scope: TenantScope): Promise<AiTokenRecord[]> {
    const rows = await this.prisma.aiAccessToken.findMany({
      where: {
        congregationId: scope.requireCongregationId(),
        denominationId: scope.denominationId,
      },
      select: TOKEN_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toTokenRecord);
  }

  async createToken(
    scope: TenantScope,
    data: NewAiTokenRecord,
    transaction: Transaction,
  ): Promise<AiTokenRecord> {
    const row = await clientOf(this.prisma, transaction).aiAccessToken.create({
      data: {
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
        name: data.name,
        tokenHash: data.tokenHash,
        tokenPrefix: data.tokenPrefix,
        createdById: data.createdById,
        expiresAt: data.expiresAt,
      },
      select: TOKEN_SELECT,
    });
    return toTokenRecord(row);
  }

  async revokeToken(
    scope: TenantScope,
    tokenId: number,
    now: Date,
    transaction: Transaction,
  ): Promise<boolean> {
    const result = await clientOf(
      this.prisma,
      transaction,
    ).aiAccessToken.updateMany({
      where: {
        id: tokenId,
        congregationId: scope.requireCongregationId(),
        denominationId: scope.denominationId,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    return result.count === 1;
  }

  async findTokenByHash(hash: string): Promise<AiTokenAuthRecord | null> {
    const row = await this.prisma.aiAccessToken.findUnique({
      where: { tokenHash: hash },
      select: {
        id: true,
        denominationId: true,
        congregationId: true,
        createdById: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        congregation: {
          select: {
            isActive: true,
            deletedAt: true,
            aiSettings: { select: { mcpEnabled: true }, take: 1 },
          },
        },
      },
    });
    return row
      ? {
          id: row.id,
          denominationId: row.denominationId,
          congregationId: row.congregationId,
          createdById: row.createdById,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
          lastUsedAt: row.lastUsedAt,
          mcpEnabled: row.congregation.aiSettings[0]?.mcpEnabled ?? false,
          congregationActive:
            row.congregation.isActive && row.congregation.deletedAt === null,
        }
      : null;
  }

  async touchToken(tokenId: number, now: Date): Promise<void> {
    await this.prisma.aiAccessToken.update({
      where: { id: tokenId },
      data: { lastUsedAt: now },
    });
  }
}
