import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  CreatePrivacyPolicyUseCase,
  DeletePrivacyPolicyUseCase,
  ListPrivacyPoliciesUseCase,
  PublishPrivacyPolicyUseCase,
  UpdatePrivacyPolicyUseCase,
} from '../application/privacy-policies.use-cases.js';
import {
  PrivacyPolicyDto,
  PrivacyPolicyInputDto,
  PrivacyPolicyListDto,
} from './privacy-policies.dto.js';

/**
 * Policies of data processing (Ley 1581 de 2012) of the denomination. The text an applicant accepts
 * comes from here: without a published policy the public form is closed.
 */
@ApiTags('privacy-policies')
@ApiTenantScope()
@Controller('privacy-policies')
export class PrivacyPoliciesController {
  constructor(
    private readonly listPolicies: ListPrivacyPoliciesUseCase,
    private readonly createPolicy: CreatePrivacyPolicyUseCase,
    private readonly updatePolicy: UpdatePrivacyPolicyUseCase,
    private readonly deletePolicy: DeletePrivacyPolicyUseCase,
    private readonly publishPolicy: PublishPrivacyPolicyUseCase,
  ) {}

  @Get()
  @RequireAnyPermission('congregations.manage', 'applications.review')
  @ApiOperation({
    summary: 'Lista las versiones de la política de datos de la denominación',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PrivacyPolicyListDto })
  list(@CurrentTenant() tenant: TenantContext): Promise<PrivacyPolicyListDto> {
    return this.listPolicies.execute(tenant);
  }

  @Post()
  @RequirePermissions('congregations.manage')
  @ApiOperation({ summary: 'Crea un borrador de política' })
  @ApiResponse({ status: HttpStatus.CREATED, type: PrivacyPolicyDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'POLICY_VERSION_EXISTS',
  })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: PrivacyPolicyInputDto,
    @ClientIp() ip: string | null,
  ): Promise<PrivacyPolicyDto> {
    return this.createPolicy.execute(tenant, body, ip);
  }

  @Put(':id')
  @RequirePermissions('congregations.manage')
  @ApiOperation({
    summary: 'Modifica un borrador',
    description: 'Una política publicada no se modifica.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PrivacyPolicyDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'POLICY_NOT_EDITABLE, POLICY_VERSION_EXISTS',
  })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: PrivacyPolicyInputDto,
    @ClientIp() ip: string | null,
  ): Promise<PrivacyPolicyDto> {
    return this.updatePolicy.execute(tenant, id, body, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('congregations.manage')
  @ApiOperation({
    summary: 'Elimina un borrador',
    description: 'Una política publicada no se elimina.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'POLICY_NOT_EDITABLE',
  })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    await this.deletePolicy.execute(tenant, id, ip);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('congregations.manage')
  @ApiOperation({
    summary: 'Publica un borrador',
    description:
      'Desde ese momento los solicitantes aceptan este texto. Si la fecha de vigencia ya pasó, rige desde hoy.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PrivacyPolicyDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'POLICY_ALREADY_PUBLISHED, POLICY_EFFECTIVE_DATE_OUTDATED',
  })
  publish(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @ClientIp() ip: string | null,
  ): Promise<PrivacyPolicyDto> {
    return this.publishPolicy.execute(tenant, id, ip);
  }
}
