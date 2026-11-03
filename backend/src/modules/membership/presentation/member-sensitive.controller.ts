import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  AnonymizeMemberUseCase,
  GetSocioeconomicProfileUseCase,
  ListConsentsUseCase,
  RevokeConsentUseCase,
  SaveSocioeconomicProfileUseCase,
} from '../application/use-cases/member-sensitive.use-cases.js';
import { SocioeconomicProfileDto } from './dto/member-requests.dto.js';
import {
  ConsentViewDto,
  SocioeconomicProfileViewDto,
} from './dto/member-responses.dto.js';
import { IdPipe, toCommandContext } from './request-helpers.js';

/** Data with its own permission or legal weight: socioeconomic profile and data consents. */
@ApiTags('members')
@ApiTenantScope()
@Controller('members/:id')
export class MemberSensitiveController {
  constructor(
    private readonly getProfile: GetSocioeconomicProfileUseCase,
    private readonly saveProfile: SaveSocioeconomicProfileUseCase,
    private readonly listConsents: ListConsentsUseCase,
    private readonly revokeConsent: RevokeConsentUseCase,
    private readonly anonymizeMember: AnonymizeMemberUseCase,
  ) {}

  @Get('socioeconomic-profile')
  @RequirePermissions('members.read', 'socioeconomic-profiles.read')
  @ApiOperation({
    summary: 'Ficha socioeconómica',
    description:
      'Null si nunca se diligenció. Cada lectura queda en la auditoría.',
  })
  @ApiOkResponse({ type: SocioeconomicProfileViewDto })
  profile(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
  ) {
    return this.getProfile.execute(toCommandContext(tenant, ipAddress), id);
  }

  @Put('socioeconomic-profile')
  @RequirePermissions('members.read', 'socioeconomic-profiles.write')
  @ApiOperation({
    summary: 'Guarda la ficha socioeconómica (reemplaza todas las respuestas)',
  })
  @ApiOkResponse({ type: SocioeconomicProfileViewDto })
  saveSocioeconomic(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Body() body: SocioeconomicProfileDto,
  ) {
    return this.saveProfile.execute(toCommandContext(tenant, ipAddress), id, {
      hasHealthCoverage: body.hasHealthCoverage ?? null,
      hasPension: body.hasPension ?? null,
      hasOccupationalRiskCoverage: body.hasOccupationalRiskCoverage ?? null,
      isSubsidizedRegime: body.isSubsidizedRegime ?? null,
      hasFamilyCompensation: body.hasFamilyCompensation ?? null,
      sisbenLevel: body.sisbenLevel ?? null,
      isDisplaced: body.isDisplaced ?? null,
    });
  }

  @Get('consents')
  @RequirePermissions('members.read')
  @ApiOperation({
    summary: 'Autorizaciones de tratamiento de datos (la más reciente primero)',
  })
  @ApiOkResponse({ type: [ConsentViewDto] })
  consents(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', IdPipe) id: number,
  ) {
    return this.listConsents.execute(tenant.tenantScope(), id);
  }

  @Post('consents/:consentId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('members.write')
  @ApiOperation({
    summary: 'Revoca una autorización de datos',
    description:
      'No la borra: queda como evidencia. Tras revocar todas, el miembro inactivo puede anonimizarse.',
  })
  @ApiNoContentResponse()
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Param('consentId', IdPipe) consentId: number,
  ): Promise<void> {
    await this.revokeConsent.execute(
      toCommandContext(tenant, ipAddress),
      id,
      consentId,
    );
  }

  @Post('anonymize')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('members.write')
  @ApiOperation({
    summary: 'Anonimiza los datos personales (irreversible)',
    description:
      'Solo con todas las autorizaciones revocadas y el miembro no activo. Borra nombres, documento, contactos, direcciones y ficha socioeconómica.',
  })
  @ApiNoContentResponse()
  async anonymize(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
  ): Promise<void> {
    await this.anonymizeMember.execute(toCommandContext(tenant, ipAddress), id);
  }
}
