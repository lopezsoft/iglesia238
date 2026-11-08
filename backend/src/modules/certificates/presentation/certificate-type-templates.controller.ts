import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  ListCertificateTypeTemplatesUseCase,
  PreviewCertificateTemplateUseCase,
  UpdateCertificateTypeUseCase,
} from '../application/use-cases/certificate-type-templates.use-cases.js';
import {
  CertificateTypeTemplateDto,
  TemplateCatalogDto,
  TemplatePreviewDto,
  UpdateCertificateTypeDto,
} from './certificate-type-templates.dto.js';

/** Editor of the printed texts of the certificate types: a task of the denomination, not of a sede. */
@ApiTags('certificates')
@ApiTenantScope()
@RequirePermissions('certificate-types.manage')
@Controller('certificate-types')
export class CertificateTypeTemplatesController {
  constructor(
    private readonly listTemplates: ListCertificateTypeTemplatesUseCase,
    private readonly updateType: UpdateCertificateTypeUseCase,
    private readonly previewTemplate: PreviewCertificateTemplateUseCase,
  ) {}

  @Get('templates')
  @ApiOperation({
    summary: 'Tipos de certificado con sus textos personalizados',
    description:
      'Incluye los marcadores disponibles y los textos que se imprimen cuando un tipo no tiene uno propio.',
  })
  @ApiOkResponse({ type: TemplateCatalogDto })
  catalog(@CurrentTenant() tenant: TenantContext) {
    return this.listTemplates.execute(tenant);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edita el nombre, la vigencia y los textos de un tipo de certificado',
    description:
      'Un texto vacío vuelve al texto por defecto. Los certificados ya expedidos no cambian: conservan el texto con el que se imprimieron.',
  })
  @ApiOkResponse({ type: CertificateTypeTemplateDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCertificateTypeDto,
    @ClientIp() ip: string | null,
  ) {
    return this.updateType.execute(tenant, id, body, ip);
  }

  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Vista previa de un certificado de ejemplo con los textos que se están editando',
    description:
      'Usa datos ficticios y no guarda nada: sirve para ver el resultado antes de guardar.',
  })
  @ApiOkResponse({ type: TemplatePreviewDto })
  preview(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCertificateTypeDto,
  ) {
    return this.previewTemplate.execute(tenant, id, body);
  }
}
