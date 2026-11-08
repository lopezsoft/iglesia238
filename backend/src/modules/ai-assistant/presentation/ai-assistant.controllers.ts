import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { Public } from '../../../common/security/public.decorator.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { McpServer } from '../application/mcp/mcp-server.js';
import {
  AiChatUseCase,
  GetAiChatStatusUseCase,
} from '../application/use-cases/ai-chat.use-case.js';
import {
  CreateAiTokenUseCase,
  GetAiSettingsUseCase,
  RemoveAiKeyUseCase,
  RevokeAiTokenUseCase,
  SaveAiKeyUseCase,
  UpdateAiSettingsUseCase,
} from '../application/use-cases/ai-settings.use-cases.js';
import { AuthenticateMcpTokenUseCase } from '../application/use-cases/authenticate-mcp-token.use-case.js';
import {
  AiChatDto,
  CreateAiTokenDto,
  SaveAiKeyDto,
  UpdateAiSettingsDto,
} from './ai-assistant.dto.js';

/** The AI settings of the sede: the key it pastes, what it turns on, and the tokens of its external connections. */
@ApiTags('ai')
@ApiTenantScope()
@RequirePermissions('ai.manage')
@Controller('ai')
export class AiSettingsController {
  constructor(
    private readonly getSettings: GetAiSettingsUseCase,
    private readonly updateSettings: UpdateAiSettingsUseCase,
    private readonly saveKey: SaveAiKeyUseCase,
    private readonly removeKey: RemoveAiKeyUseCase,
    private readonly createToken: CreateAiTokenUseCase,
    private readonly revokeToken: RevokeAiTokenUseCase,
  ) {}

  @Get('settings')
  @ApiOperation({
    summary: 'Ajustes del asistente de IA de la sede',
    description:
      'Qué está activado, el modelo, si hay clave guardada (solo sus últimos 4 caracteres) y las conexiones MCP.',
  })
  @ApiOkResponse({ description: 'Ajustes de la sede.' })
  get(@CurrentTenant() tenant: TenantContext) {
    return this.getSettings.execute(tenant);
  }

  @Patch('settings')
  @ApiOperation({
    summary:
      'Activa o desactiva el chat y las conexiones MCP, y elige el modelo',
  })
  @ApiOkResponse({ description: 'Ajustes actualizados.' })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpdateAiSettingsDto,
    @ClientIp() ip: string | null,
  ) {
    return this.updateSettings.execute(tenant, body, ip);
  }

  @Put('settings/key')
  @RateLimit({ name: 'ai-key', limit: 10, windowSeconds: 3600 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Guarda la clave de IA de la sede',
    description:
      'Se comprueba con Anthropic antes de guardarla; queda cifrada y no se puede volver a leer, solo reemplazar o quitar.',
  })
  @ApiOkResponse({ description: 'Ajustes actualizados.' })
  putKey(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: SaveAiKeyDto,
    @ClientIp() ip: string | null,
  ) {
    return this.saveKey.execute(tenant, body.apiKey, ip);
  }

  @Delete('settings/key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Quita la clave de IA de la sede (y con ella el chat)',
  })
  @ApiOkResponse({ description: 'Ajustes actualizados.' })
  deleteKey(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ip: string | null,
  ) {
    return this.removeKey.execute(tenant, ip);
  }

  @Post('tokens')
  @RateLimit({ name: 'ai-token', limit: 20, windowSeconds: 3600 })
  @ApiOperation({
    summary: 'Crea una conexión para una herramienta externa de IA (MCP)',
    description:
      'El token completo aparece solo en esta respuesta: no se guarda y no se puede volver a ver.',
  })
  @ApiOkResponse({ description: 'La conexión con su token.' })
  createAccess(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: CreateAiTokenDto,
    @ClientIp() ip: string | null,
  ) {
    return this.createToken.execute(tenant, body, ip);
  }

  @Delete('tokens/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoca una conexión: su token deja de servir de inmediato',
  })
  async revokeAccess(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    await this.revokeToken.execute(tenant, id, ip);
  }
}

/** The chat with the assistant, for whoever the sede lets use it. */
@ApiTags('ai')
@ApiTenantScope()
@RequirePermissions('ai.use')
@Controller('ai/chat')
export class AiChatController {
  constructor(
    private readonly status: GetAiChatStatusUseCase,
    private readonly chat: AiChatUseCase,
  ) {}

  @Get('status')
  @ApiOperation({
    summary:
      'Si el asistente está disponible para el usuario y qué puede consultar',
  })
  @ApiOkResponse({ description: 'Estado del asistente.' })
  getStatus(@CurrentTenant() tenant: TenantContext) {
    return this.status.execute(tenant);
  }

  @Post()
  @RateLimit({ name: 'ai-chat', limit: 30, windowSeconds: 600 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hace una pregunta al asistente de la sede',
    description:
      'Usa la clave y el modelo de la sede. El asistente solo consulta cifras agregadas, con los permisos del usuario.',
  })
  @ApiOkResponse({ description: 'La respuesta y las consultas que hizo.' })
  ask(@CurrentTenant() tenant: TenantContext, @Body() body: AiChatDto) {
    return this.chat.execute(tenant, body.messages);
  }
}

const BEARER = /^Bearer (\S+)$/;

/**
 * MCP endpoint (Streamable HTTP, stateless): an external AI tool connects with the token of a sede and can only use
 * the read-only tools. It is outside the login of the app on purpose: the token is its credential.
 */
@ApiTags('ai')
@Public()
@Controller('mcp')
export class McpController {
  constructor(
    private readonly authenticate: AuthenticateMcpTokenUseCase,
    private readonly server: McpServer,
  ) {}

  @Post()
  @RateLimit({ name: 'mcp', limit: 120, windowSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Servidor MCP de solo lectura (JSON-RPC sobre HTTP)',
    description:
      'Autenticación: Authorization: Bearer <token de la conexión>. Herramientas con cifras agregadas, sin datos personales.',
  })
  @ApiOkResponse({ description: 'Respuesta JSON-RPC.' })
  async handle(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const tenant = await this.authenticate.execute(
      BEARER.exec(authorization ?? '')?.[1],
    );
    const answer = await this.server.handle(tenant, body);
    if (answer.kind === 'none') {
      // A notification: accepted, nothing to say.
      void reply.code(HttpStatus.ACCEPTED);
      return undefined;
    }
    return answer.body;
  }

  /** The protocol allows a server to offer a stream here; this one does not. */
  @Get()
  @ApiExcludeEndpoint()
  notAllowed(@Res({ passthrough: true }) reply: FastifyReply): string {
    void reply.code(HttpStatus.METHOD_NOT_ALLOWED).header('Allow', 'POST');
    return 'Usa POST.';
  }
}
