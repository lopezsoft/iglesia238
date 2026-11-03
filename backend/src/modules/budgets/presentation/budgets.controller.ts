import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type {
  BudgetHead,
  BudgetLineDetail,
  BudgetLineRow,
  BudgetOverview,
  CopyBudgetResult,
} from '../application/budget.models.js';
import {
  CopyBudgetUseCase,
  ChangeBudgetStatusUseCase,
  UpdateBudgetIncomeRateUseCase,
} from '../application/manage-budget.use-cases.js';
import { DeleteBudgetLineUseCase } from '../application/delete-budget-line.use-case.js';
import { GetBudgetLineDetailUseCase } from '../application/get-budget-line-detail.use-case.js';
import { GetBudgetOverviewUseCase } from '../application/get-budget-overview.use-case.js';
import { SaveBudgetLineUseCase } from '../application/save-budget-line.use-case.js';
import {
  BudgetHeadResponseDto,
  BudgetLineDetailResponseDto,
  BudgetLineResponseDto,
  BudgetOverviewQueryDto,
  BudgetOverviewResponseDto,
  ChangeBudgetStatusDto,
  CopyBudgetDto,
  CopyBudgetResponseDto,
  SaveBudgetLineDto,
  UpdateBudgetRateDto,
} from './budgets.dto.js';

/** E-06 Presupuesto: fixed and committee budgets of a sede per year, restricted to budgets.manage. */
@ApiTags('budgets')
@ApiTenantScope()
@RequirePermissions('budgets.manage')
@ApiForbiddenResponse({
  description: 'Sin el permiso budgets.manage en el alcance activo.',
})
@Controller('accounting/budgets')
export class BudgetsController {
  constructor(
    private readonly getOverview: GetBudgetOverviewUseCase,
    private readonly saveLine: SaveBudgetLineUseCase,
    private readonly deleteLine: DeleteBudgetLineUseCase,
    private readonly getLineDetail: GetBudgetLineDetailUseCase,
    private readonly changeStatus: ChangeBudgetStatusUseCase,
    private readonly updateRate: UpdateBudgetIncomeRateUseCase,
    private readonly copyBudget: CopyBudgetUseCase,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'Presupuestos fijo y por comités del año con su ejecución real contra el libro de caja, más las cuentas y fondos disponibles',
  })
  @ApiOkResponse({ type: BudgetOverviewResponseDto })
  overview(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: BudgetOverviewQueryDto,
  ): Promise<BudgetOverview> {
    return this.getOverview.execute(tenant, query.year ?? null);
  }

  @Get('lines/:id')
  @ApiOperation({
    summary:
      'Detalle de una línea: ejecución mes a mes y últimos movimientos de caja',
  })
  @ApiOkResponse({ type: BudgetLineDetailResponseDto })
  @ApiNotFoundResponse({ description: 'La línea no existe o es de otra sede.' })
  lineDetail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
  ): Promise<BudgetLineDetail> {
    return this.getLineDetail.execute(tenant, id);
  }

  @Post('lines')
  @ApiOperation({
    summary:
      'Agrega una línea; la primera de un año y tipo crea el presupuesto como borrador',
  })
  @ApiCreatedResponse({ type: BudgetLineResponseDto })
  @ApiConflictResponse({
    description: 'DUPLICATE_BUDGET_LINE o BUDGET_CLOSED.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'ACCOUNT_NOT_POSTABLE o FUND_INACTIVE.',
  })
  createLine(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: SaveBudgetLineDto,
    @ClientIp() ip: string | null,
  ): Promise<BudgetLineRow> {
    return this.saveLine.execute(tenant, null, toCommand(body), ip);
  }

  @Put('lines/:id')
  @ApiOperation({ summary: 'Edita una línea del presupuesto de la sede' })
  @ApiOkResponse({ type: BudgetLineResponseDto })
  @ApiNotFoundResponse({
    description:
      'La línea no existe, es de otra sede o no pertenece a ese presupuesto.',
  })
  @ApiConflictResponse({
    description: 'DUPLICATE_BUDGET_LINE o BUDGET_CLOSED.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'ACCOUNT_NOT_POSTABLE o FUND_INACTIVE.',
  })
  updateLineById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: SaveBudgetLineDto,
    @ClientIp() ip: string | null,
  ): Promise<BudgetLineRow> {
    return this.saveLine.execute(tenant, id, toCommand(body), ip);
  }

  @Delete('lines/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Elimina una línea; los movimientos de caja no cambian',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'La línea no existe o es de otra sede.' })
  @ApiConflictResponse({ description: 'BUDGET_CLOSED.' })
  async removeLine(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    await this.deleteLine.execute(tenant, id, ip);
  }

  @Post('copy')
  @ApiOperation({
    summary:
      'Copia las líneas de un año a otro (con ajuste porcentual opcional) como borrador',
  })
  @ApiCreatedResponse({ type: CopyBudgetResponseDto })
  @ApiNotFoundResponse({
    description: 'SOURCE_BUDGET_NOT_FOUND: el año de origen no tiene líneas.',
  })
  @ApiConflictResponse({
    description: 'BUDGET_CLOSED: el destino está cerrado.',
  })
  copy(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: CopyBudgetDto,
    @ClientIp() ip: string | null,
  ): Promise<CopyBudgetResult> {
    return this.copyBudget.execute(
      tenant,
      {
        type: body.type,
        sourceYear: body.sourceYear,
        targetYear: body.targetYear,
        adjustmentRate: body.adjustmentRate ?? null,
      },
      ip,
    );
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Cambia el estado: borrador -> aprobado -> cerrado (un aprobado puede volver a borrador)',
  })
  @ApiOkResponse({ type: BudgetHeadResponseDto })
  @ApiNotFoundResponse({
    description: 'El presupuesto no existe o es de otra sede.',
  })
  @ApiConflictResponse({
    description: 'BUDGET_STATUS_INVALID o BUDGET_CLOSED.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'BUDGET_EMPTY: no se puede aprobar sin líneas.',
  })
  status(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: ChangeBudgetStatusDto,
    @ClientIp() ip: string | null,
  ): Promise<BudgetHead> {
    return this.changeStatus.execute(tenant, id, body.status, ip);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualiza el incremento esperado de ingresos del presupuesto',
  })
  @ApiOkResponse({ type: BudgetHeadResponseDto })
  @ApiNotFoundResponse({
    description: 'El presupuesto no existe o es de otra sede.',
  })
  @ApiConflictResponse({ description: 'BUDGET_CLOSED.' })
  settings(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: UpdateBudgetRateDto,
    @ClientIp() ip: string | null,
  ): Promise<BudgetHead> {
    return this.updateRate.execute(
      tenant,
      id,
      body.incomeIncreaseRate ?? null,
      ip,
    );
  }
}

function toCommand(body: SaveBudgetLineDto) {
  return {
    year: body.year,
    type: body.type,
    accountId: body.accountId,
    fundId: body.fundId,
    annualAmount: body.annualAmount,
    monthlyAmount: body.monthlyAmount ?? null,
  };
}
