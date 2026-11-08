import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/security/current-user.decorators.js';
import { RequireAnyPermission } from '../../../common/security/permissions.decorator.js';
import { DONATION_ISSUE_PERMISSION } from '../application/certificate-access.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { ListCertificateTypesUseCase } from '../application/use-cases/list-certificate-types.use-case.js';
import { CertificateTypeDto } from './certificate-responses.dto.js';

@ApiTags('certificates')
@ApiTenantScope()
@RequireAnyPermission('certificates.issue', DONATION_ISSUE_PERMISSION)
@Controller('certificate-types')
export class CertificateTypesController {
  constructor(private readonly listTypes: ListCertificateTypesUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Tipos de certificado de la denominación',
    description:
      'Disponible también en alcance de denominación (sirve para filtrar el listado).',
  })
  @ApiOkResponse({ type: [CertificateTypeDto] })
  list(@CurrentTenant() tenant: TenantContext) {
    return this.listTypes.execute(tenant);
  }
}
