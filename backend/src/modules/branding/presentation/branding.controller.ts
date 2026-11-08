import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Put,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  GetBrandingUseCase,
  RemoveLogoUseCase,
  UpdateBrandColorUseCase,
  UploadLogoUseCase,
} from '../application/use-cases/branding.use-cases.js';
import {
  BrandingDto,
  UpdateBrandColorDto,
  UploadLogoDto,
} from './branding.dto.js';

/** The visual identity (logo and color) of the denomination of the session. */
@ApiTags('branding')
@ApiTenantScope()
@RequirePermissions('branding.manage')
@Controller('branding')
export class BrandingController {
  constructor(
    private readonly getBranding: GetBrandingUseCase,
    private readonly uploadLogo: UploadLogoUseCase,
    private readonly removeLogo: RemoveLogoUseCase,
    private readonly updateColor: UpdateBrandColorUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Logo y color de la denominación' })
  @ApiOkResponse({ type: BrandingDto })
  get(@CurrentTenant() tenant: TenantContext) {
    return this.getBranding.execute(tenant);
  }

  @Put('logo')
  @RateLimit({ name: 'branding-logo', limit: 20, windowSeconds: 3600 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sube o reemplaza el logo (PNG o JPEG, en base64)',
    description:
      'Máximo 512 KB. Los certificados ya expedidos conservan el logo con el que se imprimieron: el archivo anterior no se borra.',
  })
  @ApiOkResponse({ type: BrandingDto })
  putLogo(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UploadLogoDto,
    @ClientIp() ip: string | null,
  ) {
    return this.uploadLogo.execute(tenant, body.contentBase64, ip);
  }

  @Delete('logo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quita el logo de la denominación' })
  @ApiOkResponse({ type: BrandingDto })
  deleteLogo(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ip: string | null,
  ) {
    return this.removeLogo.execute(tenant, ip);
  }

  @Patch()
  @ApiOperation({
    summary: 'Cambia el color institucional',
    description:
      'Exige contraste suficiente sobre blanco (4,5:1). Vacío o null vuelve al color por defecto.',
  })
  @ApiOkResponse({ type: BrandingDto })
  patch(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpdateBrandColorDto,
    @ClientIp() ip: string | null,
  ) {
    return this.updateColor.execute(tenant, body.primaryColor, ip);
  }
}
