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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  AccountingPermissions,
  CATALOG_READ_PERMISSIONS,
} from '../../../common/accounting/accounting-permissions.js';
import type { FastifyReply } from 'fastify';
import { sendPdf } from '../../../common/http/document-response.js';
import { CurrentTenant } from '../../../common/security/current-user.decorators.js';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { CashBookQueryService } from '../application/cash-book-query.service.js';
import { CashMovementsService } from '../application/cash-movements.service.js';
import { ConsolidationService } from '../application/consolidation.service.js';
import { PeriodCloseService } from '../application/period-close.service.js';
import { VoucherDocumentService } from '../application/voucher-document.service.js';
import { VouchersService } from '../application/vouchers.service.js';
import {
  CashBookOptionsDto,
  CashBookQueryDto,
  CashBookViewDto,
  CashMovementReceiptDto,
  CashPeriodDto,
  ConsolidateDto,
  ConsolidationDateQueryDto,
  ConsolidationPreviewDto,
  ConsolidationResultDto,
  RecordMovementDto,
  ReverseMovementDto,
  VoucherDetailDto,
  VoucherDetailQueryDto,
  VoucherListQueryDto,
  VoucherPageDto,
} from './cash-book.dto.js';

const CASH = AccountingPermissions.cashWrite;

@ApiTags('cash-book')
@ApiTenantScope()
@Controller('accounting/cash-book')
export class CashBookController {
  constructor(
    private readonly queries: CashBookQueryService,
    private readonly movements: CashMovementsService,
    private readonly consolidation: ConsolidationService,
  ) {}

  @Get('options')
  @RequirePermissions(CASH)
  @ApiOperation({
    summary: 'Catálogos del libro de caja de la sede',
    description:
      'Fondos, cuentas imputables y periodos. Con alcance de denominación los periodos llegan vacíos.',
  })
  @ApiOkResponse({ type: CashBookOptionsDto })
  options(@CurrentTenant() tenant: TenantContext): Promise<CashBookOptionsDto> {
    return this.queries.options(tenant);
  }

  @Get()
  @RequirePermissions(CASH)
  @ApiOperation({
    summary: 'Libro de caja de un fondo en un periodo',
    description:
      'Totales del mes, saldo corrido por línea (también con filtros) y la página pedida de movimientos.',
  })
  @ApiOkResponse({ type: CashBookViewDto })
  @ApiNotFoundResponse({
    description: 'El periodo o el fondo no existen en la sede',
  })
  view(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: CashBookQueryDto,
  ): Promise<CashBookViewDto> {
    return this.queries.view(tenant, query);
  }

  @Post('transactions')
  @RequirePermissions(CASH)
  @ApiOperation({
    summary: 'Registra una entrada o una salida con su comprobante CI o CE',
  })
  @ApiCreatedResponse({ type: CashMovementReceiptDto })
  @ApiConflictResponse({ description: 'Periodo cerrado o fondo inactivo' })
  record(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: RecordMovementDto,
  ): Promise<CashMovementReceiptDto> {
    return this.movements.record(tenant, body);
  }

  @Post('transactions/:id/reverse')
  @RequirePermissions(CASH)
  @ApiOperation({
    summary:
      'Reversa un movimiento (misma cuenta, fondo e importe, sentido contrario)',
    description:
      'Solo una vez por línea. Los aportes y las liquidaciones se anulan en su pantalla; reversar una consolidación libera sus aportes.',
  })
  @ApiCreatedResponse({ type: CashMovementReceiptDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: 'Ya reversado, línea de aporte o liquidación, periodo cerrado',
  })
  reverse(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReverseMovementDto,
  ): Promise<CashMovementReceiptDto> {
    return this.movements.reverse(tenant, {
      transactionId: id,
      postedOn: body.postedOn,
      reason: body.reason,
    });
  }

  @Get('consolidation-preview')
  @RequirePermissions(CASH)
  @ApiOperation({
    summary:
      'Aportes de una fecha pendientes de pasar al libro, por cuenta y fondo',
  })
  @ApiOkResponse({ type: ConsolidationPreviewDto })
  preview(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ConsolidationDateQueryDto,
  ): Promise<ConsolidationPreviewDto> {
    return this.consolidation.preview(tenant, query.date);
  }

  @Post('consolidations')
  @RequirePermissions(CASH)
  @ApiOperation({
    summary: 'Consolida los aportes de una fecha en el libro de caja',
    description:
      'Una entrada por cuenta y fondo, todas con un mismo comprobante CI.',
  })
  @ApiCreatedResponse({ type: ConsolidationResultDto })
  @ApiConflictResponse({
    description: 'Nada que consolidar, periodo cerrado o aportes que cambiaron',
  })
  consolidate(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: ConsolidateDto,
  ): Promise<ConsolidationResultDto> {
    return this.consolidation.consolidate(tenant, body.date);
  }
}

@ApiTags('cash-book')
@ApiTenantScope()
@Controller('accounting/periods')
export class PeriodCloseController {
  constructor(private readonly closing: PeriodCloseService) {}

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(CASH)
  @ApiOperation({
    summary: 'Cierra un periodo contable',
    description:
      'En orden, solo meses ya terminados y sin aportes pendientes. Abre el mes siguiente y, en diciembre, arrastra los saldos al año nuevo.',
  })
  @ApiOkResponse({ type: CashPeriodDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      'Periodo ya cerrado, anterior abierto, mes en curso o aportes pendientes',
  })
  close(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CashPeriodDto> {
    return this.closing.close(tenant, id);
  }
}

@ApiTags('vouchers')
@ApiTenantScope()
@Controller('accounting/vouchers')
export class VouchersController {
  constructor(
    private readonly vouchers: VouchersService,
    private readonly documents: VoucherDocumentService,
  ) {}

  @Get()
  @RequireAnyPermission(
    ...CATALOG_READ_PERMISSIONS.filter(
      (permission) => permission !== AccountingPermissions.budgetsManage,
    ),
  )
  @ApiOperation({
    summary:
      'Comprobantes de la sede (recibos, ingresos, egresos y liquidaciones)',
    description:
      'Cada tipo exige su permiso: REC contributions.read, CI y CE cash-transactions.write, LD tithe-settlements.write.',
  })
  @ApiOkResponse({ type: VoucherPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: VoucherListQueryDto,
  ): Promise<VoucherPageDto> {
    return this.vouchers.list(tenant, query);
  }

  @Get(':id')
  @RequireAnyPermission(
    ...CATALOG_READ_PERMISSIONS.filter(
      (permission) => permission !== AccountingPermissions.budgetsManage,
    ),
  )
  @ApiOperation({ summary: 'Un comprobante con sus movimientos y aportes' })
  @ApiOkResponse({ type: VoucherDetailDto })
  @ApiNotFoundResponse()
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: VoucherDetailQueryDto,
  ): Promise<VoucherDetailDto> {
    return this.vouchers.get(tenant, id, query.congregationId);
  }

  @Get(':id/pdf')
  @RequireAnyPermission(
    ...CATALOG_READ_PERMISSIONS.filter(
      (permission) => permission !== AccountingPermissions.budgetsManage,
    ),
  )
  @ApiOperation({
    summary: 'Recibo o comprobante listo para imprimir (PDF)',
    description:
      'Mismas reglas que el detalle: cada tipo exige su permiso y la sede se valida. Un comprobante anulado se imprime con la marca ANULADO.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Archivo PDF.' })
  @ApiNotFoundResponse()
  async pdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: VoucherDetailQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return sendPdf(
      reply,
      await this.documents.render(tenant, id, query.congregationId),
    );
  }
}
