import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { MembershipModule } from '../membership/membership.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { TitheSettlementsModule } from '../tithe-settlements/tithe-settlements.module.js';
import { McpServer } from './application/mcp/mcp-server.js';
import {
  AI_GATEWAY,
  AI_SECRET_CIPHER,
  AI_SETTINGS_REPOSITORY,
} from './application/ports/ai-assistant.ports.js';
import { AI_TOOLS, type AiTool } from './application/tools/ai-tool.js';
import { AiToolCatalog } from './application/tools/ai-tool-catalog.js';
import {
  AttendanceStatsTool,
  FinancialSummaryTool,
  MembershipSummaryTool,
  TitheSummaryTool,
} from './application/tools/ai-tools.js';
import {
  AiChatUseCase,
  GetAiChatStatusUseCase,
} from './application/use-cases/ai-chat.use-case.js';
import {
  AI_MCP_URL,
  CreateAiTokenUseCase,
  GetAiSettingsUseCase,
  RemoveAiKeyUseCase,
  RevokeAiTokenUseCase,
  SaveAiKeyUseCase,
  UpdateAiSettingsUseCase,
} from './application/use-cases/ai-settings.use-cases.js';
import { AuthenticateMcpTokenUseCase } from './application/use-cases/authenticate-mcp-token.use-case.js';
import { AesSecretCipher } from './infrastructure/aes-secret-cipher.js';
import { AnthropicGateway } from './infrastructure/anthropic-gateway.js';
import { PrismaAiSettingsRepository } from './infrastructure/prisma-ai-settings.repository.js';
import {
  AiChatController,
  AiSettingsController,
  McpController,
} from './presentation/ai-assistant.controllers.js';

/**
 * The AI assistant of each sede. The sede pastes its own provider key and decides what to turn on: a chat inside the
 * app, and/or connections for external AI tools (MCP). Both answer from the same read-only tools, which return figures
 * added up and never the data of a person. Audit, transactions and the clock come from the FoundationModule.
 */
@Module({
  imports: [
    PrismaModule,
    ReportsModule,
    AttendanceModule,
    TitheSettlementsModule,
    MembershipModule,
  ],
  controllers: [AiSettingsController, AiChatController, McpController],
  providers: [
    { provide: AI_SETTINGS_REPOSITORY, useClass: PrismaAiSettingsRepository },
    { provide: AI_GATEWAY, useClass: AnthropicGateway },
    {
      provide: AI_SECRET_CIPHER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) =>
        new AesSecretCipher({
          secret:
            config.get('AI_SECRETS_KEY', { infer: true }) ??
            config.get('JWT_SECRET', { infer: true }),
        }),
    },
    {
      provide: AI_MCP_URL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) =>
        `${config.get('APP_BASE_URL', { infer: true }).replace(/\/+$/, '')}/api/mcp`,
    },
    FinancialSummaryTool,
    AttendanceStatsTool,
    TitheSummaryTool,
    MembershipSummaryTool,
    {
      provide: AI_TOOLS,
      inject: [
        FinancialSummaryTool,
        AttendanceStatsTool,
        TitheSummaryTool,
        MembershipSummaryTool,
      ],
      useFactory: (...tools: AiTool[]) => tools,
    },
    AiToolCatalog,
    McpServer,
    GetAiSettingsUseCase,
    UpdateAiSettingsUseCase,
    SaveAiKeyUseCase,
    RemoveAiKeyUseCase,
    CreateAiTokenUseCase,
    RevokeAiTokenUseCase,
    GetAiChatStatusUseCase,
    AiChatUseCase,
    AuthenticateMcpTokenUseCase,
  ],
})
export class AiAssistantModule {}
