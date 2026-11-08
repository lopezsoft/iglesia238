import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequireAnyPermission } from '../../../common/security/permissions.decorator.js';
import { DONATION_ISSUE_PERMISSION } from '../application/certificate-access.js';
import { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { ExportCertificatesUseCase } from '../application/use-cases/export-certificates.use-case.js';
import { GetCertificateUseCase } from '../application/use-cases/get-certificate.use-case.js';
import { GetCertificatesSummaryUseCase } from '../application/use-cases/get-certificates-summary.use-case.js';
import { GetIssuingContextUseCase } from '../application/use-cases/get-issuing-context.use-case.js';
import { IssueCertificateUseCase } from '../application/use-cases/issue-certificate.use-case.js';
import { ListCertificatesUseCase } from '../application/use-cases/list-certificates.use-case.js';
import { PreviewCertificateUseCase } from '../application/use-cases/preview-certificate.use-case.js';
import { RenderCertificatePdfUseCase } from '../application/use-cases/render-certificate-pdf.use-case.js';
import {
  FindCertificateMemberUseCase,
  SearchCertificateMembersUseCase,
} from '../application/use-cases/search-certificate-members.use-case.js';
import { VoidCertificateUseCase } from '../application/use-cases/void-certificate.use-case.js';
import type { CertificateFilter } from '../application/certificate.models.js';
import {
  CertificateFilterQueryDto,
  IssueCertificateDto,
  ListCertificatesQueryDto,
  MemberSearchQueryDto,
  PreviewCertificateDto,
  ScopeCongregationQueryDto,
  VoidDto,
} from './certificate-requests.dto.js';
import {
  CertificateDetailDto,
  CertificateListItemDto,
  CertificatePageDto,
  CertificatePreviewDto,
  CertificatesSummaryDto,
  IssuingContextDto,
  MemberOptionDto,
} from './certificate-responses.dto.js';
import { sendCsv, sendPdf } from './document-response.js';

function toFilter(query: CertificateFilterQueryDto): CertificateFilter {
  return {
    typeCode: query.typeCode?.toUpperCase(),
    status: query.status,
    q: query.q,
    memberId: query.memberId,
    issuedFrom: query.issuedFrom,
    issuedTo: query.issuedTo,
    sort: query.sort,
  };
}

@ApiTags('certificates')
@ApiTenantScope()
@RequireAnyPermission('certificates.issue', DONATION_ISSUE_PERMISSION)
@Controller('certificates')
export class CertificatesController {
  constructor(
    private readonly issuingContext: GetIssuingContextUseCase,
    private readonly summary: GetCertificatesSummaryUseCase,
    private readonly searchMembers: SearchCertificateMembersUseCase,
    private readonly findMember: FindCertificateMemberUseCase,
    private readonly preview: PreviewCertificateUseCase,
    private readonly issue: IssueCertificateUseCase,
    private readonly list: ListCertificatesUseCase,
    private readonly exportCsv: ExportCertificatesUseCase,
    private readonly get: GetCertificateUseCase,
    private readonly voidCertificate: VoidCertificateUseCase,
    private readonly pdf: RenderCertificatePdfUseCase,
  ) {}

  @Get('issuing-context')
  @ApiOperation({
    summary:
      'Datos para emitir: membrete, firmantes, hoy y siguiente número por tipo',
    description:
      'Exige una sede activa (X-Scope: C:<id>). Con alcance de denominación responde CONGREGATION_SCOPE_REQUIRED.',
  })
  @ApiOkResponse({ type: IssuingContextDto })
  getIssuingContext(@CurrentTenant() tenant: TenantContext) {
    return this.issuingContext.execute(tenant);
  }

  @Get('summary')
  @ApiOperation({
    summary:
      'Contadores del año: certificados emitidos y anulados, carnés por estado',
  })
  @ApiOkResponse({ type: CertificatesSummaryDto })
  getSummary(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ScopeCongregationQueryDto,
  ) {
    return this.summary.execute(tenant, query.congregationId);
  }

  @Get('member-options')
  @ApiOperation({
    summary: 'Busca miembros activos de la sede por nombre, código o documento',
    description:
      'El documento siempre sale enmascarado. Menos de 2 caracteres devuelve una lista vacía.',
  })
  @ApiOkResponse({ type: [MemberOptionDto] })
  searchMemberOptions(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: MemberSearchQueryDto,
  ) {
    return this.searchMembers.execute(tenant, query.q, query.limit);
  }

  @Get('member-options/:memberId')
  @ApiOperation({
    summary:
      'Un miembro activo de la sede (por ejemplo, el preseleccionado desde su ficha)',
  })
  @ApiOkResponse({ type: MemberOptionDto })
  getMemberOption(
    @CurrentTenant() tenant: TenantContext,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.findMember.execute(tenant, memberId);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Vista previa del certificado con el siguiente número (no lo reserva)',
  })
  @ApiOkResponse({ type: CertificatePreviewDto })
  previewCertificate(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: PreviewCertificateDto,
  ) {
    return this.preview.execute(tenant, {
      memberId: body.memberId,
      certificateTypeId: body.certificateTypeId,
      notes: body.notes ?? null,
      fiscalYear: body.fiscalYear ?? null,
    });
  }

  @Get('export')
  @ApiOperation({
    summary:
      'Exporta a CSV (UTF-8 con BOM, separador ;) los certificados filtrados',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async exportCertificates(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CertificateFilterQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const file = await this.exportCsv.execute(
      tenant,
      toFilter(query),
      query.congregationId,
    );
    return sendCsv(reply, file);
  }

  @Get()
  @ApiOperation({ summary: 'Lista paginada de certificados con filtros' })
  @ApiOkResponse({ type: CertificatePageDto })
  listCertificates(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListCertificatesQueryDto,
  ) {
    return this.list.execute(tenant, {
      filter: toFilter(query),
      paging: { page: query.page, pageSize: query.pageSize },
      congregationId: query.congregationId,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Emite un certificado',
    description:
      'Numera sin huecos por sede y tipo (CERT:<CODE>) y guarda lo impreso (snapshot) en la misma transacción.',
  })
  @ApiCreatedResponse({ type: CertificateListItemDto })
  issueCertificate(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: IssueCertificateDto,
    @ClientIp() ip: string | null,
  ) {
    return this.issue.execute(
      tenant,
      {
        memberId: body.memberId,
        certificateTypeId: body.certificateTypeId,
        notes: body.notes ?? null,
        fiscalYear: body.fiscalYear ?? null,
      },
      ip,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un certificado con lo que se imprimió' })
  @ApiOkResponse({ type: CertificateDetailDto })
  getCertificate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.get.execute(tenant, id);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Anula un certificado con motivo',
    description:
      'El número no se reutiliza. Un certificado anulado no vuelve a estar vigente.',
  })
  @ApiOkResponse({ type: CertificateListItemDto })
  voidOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: VoidDto,
    @ClientIp() ip: string | null,
  ) {
    return this.voidCertificate.execute(
      tenant,
      { id, reason: body.reason },
      ip,
    );
  }

  @Get(':id/pdf')
  @ApiOperation({
    summary: 'PDF del certificado (carta vertical) dibujado desde lo emitido',
    description: 'Un certificado anulado sale con la marca ANULADO.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async getPdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return sendPdf(reply, await this.pdf.execute(tenant, id));
  }
}
