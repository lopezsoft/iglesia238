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
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { IssueCardUseCase } from '../application/use-cases/issue-card.use-case.js';
import { ListCardCandidatesUseCase } from '../application/use-cases/list-card-candidates.use-case.js';
import { ListCardsUseCase } from '../application/use-cases/list-cards.use-case.js';
import { RenderCardPdfUseCase } from '../application/use-cases/render-card-pdf.use-case.js';
import { VoidCardUseCase } from '../application/use-cases/void-card.use-case.js';
import {
  CardCandidatesQueryDto,
  IssueCardDto,
  ListCardsQueryDto,
  VoidDto,
} from './certificate-requests.dto.js';
import {
  CardCandidatePageDto,
  CardListItemDto,
  CardPageDto,
} from './certificate-responses.dto.js';
import { sendPdf } from './document-response.js';

@ApiTags('membership-cards')
@ApiTenantScope()
@RequirePermissions('certificates.issue')
@Controller('membership-cards')
export class MembershipCardsController {
  constructor(
    private readonly list: ListCardsUseCase,
    private readonly candidates: ListCardCandidatesUseCase,
    private readonly issue: IssueCardUseCase,
    private readonly voidCard: VoidCardUseCase,
    private readonly pdf: RenderCardPdfUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista paginada de carnés',
    description:
      'El estado (VALID, EXPIRED, VOIDED) se deriva de la fecha de hoy en Bogotá.',
  })
  @ApiOkResponse({ type: CardPageDto })
  listCards(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListCardsQueryDto,
  ) {
    return this.list.execute(tenant, {
      status: query.status,
      q: query.q,
      expiringInDays: query.expiringInDays,
      paging: { page: query.page, pageSize: query.pageSize },
      congregationId: query.congregationId,
    });
  }

  @Get('candidates')
  @ApiOperation({
    summary:
      'Miembros activos de la sede que pueden recibir un carné (sin carné vigente)',
  })
  @ApiOkResponse({ type: CardCandidatePageDto })
  listCandidates(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CardCandidatesQueryDto,
  ) {
    return this.candidates.execute(tenant, {
      q: query.q,
      paging: { page: query.page, pageSize: query.pageSize },
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Emite un carné de miembro',
    description:
      'Un solo carné vigente por miembro en la sede. Los carnés vigentes de sedes anteriores se anulan.',
  })
  @ApiCreatedResponse({ type: CardListItemDto })
  issueCard(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: IssueCardDto,
    @ClientIp() ip: string | null,
  ) {
    return this.issue.execute(tenant, body, ip);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anula un carné vigente con motivo' })
  @ApiOkResponse({ type: CardListItemDto })
  voidOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: VoidDto,
    @ClientIp() ip: string | null,
  ) {
    return this.voidCard.execute(tenant, { id, reason: body.reason }, ip);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'PDF del carné en tamaño CR80 (anverso y reverso)' })
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
