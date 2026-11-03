import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { MAX_MONEY_AMOUNT } from '../../../common/accounting/accounting-rules.js';

const BUDGET_TYPES = ['FIXED', 'COMMITTEE'] as const;
const MONEY = {
  maxDecimalPlaces: 2,
  allowNaN: false,
  allowInfinity: false,
} as const;

// ---------- Requests ----------

export class BudgetOverviewQueryDto {
  @ApiPropertyOptional({
    example: 2026,
    description: 'Año del presupuesto; si se omite, el año actual.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El año no es válido.' })
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class SaveBudgetLineDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt({ message: 'El año del presupuesto no es válido.' })
  @Min(2000, { message: 'El año del presupuesto no es válido.' })
  @Max(2100, { message: 'El año del presupuesto no es válido.' })
  year!: number;

  @ApiProperty({ enum: BUDGET_TYPES })
  @IsIn(BUDGET_TYPES, { message: 'El tipo de presupuesto no es válido.' })
  type!: 'FIXED' | 'COMMITTEE';

  @ApiProperty({ description: 'Cuenta imputable y activa de la denominación.' })
  @Type(() => Number)
  @IsInt({ message: 'Selecciona una cuenta imputable.' })
  @Min(1)
  accountId!: number;

  @ApiProperty({
    description: 'Fondo activo; en el presupuesto por comités, el comité.',
  })
  @Type(() => Number)
  @IsInt({ message: 'Selecciona el fondo de la línea.' })
  @Min(1)
  fundId!: number;

  @ApiProperty({ example: 12_000_000, maximum: MAX_MONEY_AMOUNT })
  @IsNumber(MONEY, {
    message: 'El valor anual debe ser un monto con máximo dos decimales.',
  })
  @Min(0.01, { message: 'El valor anual debe ser mayor que cero.' })
  @Max(MAX_MONEY_AMOUNT)
  annualAmount!: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 1_000_000,
    description: 'Opcional; no puede superar el anual.',
  })
  @IsOptional()
  @IsNumber(MONEY, {
    message: 'El valor mensual debe ser un monto con máximo dos decimales.',
  })
  @Min(0.01, { message: 'El valor mensual debe ser mayor que cero.' })
  @Max(MAX_MONEY_AMOUNT)
  monthlyAmount?: number | null;
}

export class ChangeBudgetStatusDto {
  @ApiProperty({ enum: ['DRAFT', 'APPROVED', 'CLOSED'] })
  @IsIn(['DRAFT', 'APPROVED', 'CLOSED'], { message: 'El estado no es válido.' })
  status!: 'DRAFT' | 'APPROVED' | 'CLOSED';
}

export class UpdateBudgetRateDto {
  @ApiProperty({
    nullable: true,
    example: 0.05,
    description:
      'Incremento esperado de ingresos como fracción (0.05 = 5 %); null lo quita.',
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'Ingresa un porcentaje válido.' },
  )
  @Min(0, { message: 'El incremento debe estar entre 0 % y 100 %.' })
  @Max(1, { message: 'El incremento debe estar entre 0 % y 100 %.' })
  incomeIncreaseRate!: number | null;
}

export class CopyBudgetDto {
  @ApiProperty({ enum: BUDGET_TYPES })
  @IsIn(BUDGET_TYPES, { message: 'El tipo de presupuesto no es válido.' })
  type!: 'FIXED' | 'COMMITTEE';

  @ApiProperty({ example: 2025 })
  @Type(() => Number)
  @IsInt({ message: 'El año de origen no es válido.' })
  @Min(2000)
  @Max(2100)
  sourceYear!: number;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt({ message: 'El año de destino no es válido.' })
  @Min(2000)
  @Max(2100)
  targetYear!: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 0.05,
    description:
      'Ajuste aplicado a cada valor copiado como fracción (0.05 = +5 %).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Ingresa un ajuste válido.' })
  @Min(-0.99)
  @Max(10)
  adjustmentRate?: number | null;
}

// ---------- Responses ----------

export class BudgetTotalsResponseDto {
  @ApiProperty() annual!: number;
  @ApiProperty() monthly!: number;
  @ApiProperty() executed!: number;
  @ApiProperty({ description: 'Ejecutado / anual x 100, con un decimal.' })
  executionPct!: number;
  @ApiProperty({ description: 'Anual menos ejecutado.' }) difference!: number;
}

export class BudgetLineResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() budgetId!: number;
  @ApiProperty() accountId!: number;
  @ApiProperty({ example: '510505' }) accountCode!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty({ enum: ['INCOME', 'EXPENSE'] }) nature!: 'INCOME' | 'EXPENSE';
  @ApiProperty() fundId!: number;
  @ApiProperty() fundName!: string;
  @ApiProperty({ nullable: true }) monthlyAmount!: number | null;
  @ApiProperty() annualAmount!: number;
  @ApiProperty({
    description:
      'Movimientos netos del año en la cuenta y el fondo de la sede.',
  })
  executed!: number;
  @ApiProperty() executionPct!: number;
  @ApiProperty() overExecuted!: boolean;
  @ApiProperty() difference!: number;
  @ApiProperty({
    type: [String],
    description: 'Otros comités con una línea en la misma cuenta.',
  })
  sharedWith!: string[];
}

export class CommitteeGroupResponseDto {
  @ApiProperty() fundId!: number;
  @ApiProperty() fundName!: string;
  @ApiProperty({ type: [BudgetLineResponseDto] })
  lines!: BudgetLineResponseDto[];
  @ApiProperty({ type: BudgetTotalsResponseDto })
  totals!: BudgetTotalsResponseDto;
}

export class BudgetViewResponseDto {
  @ApiProperty({ enum: BUDGET_TYPES }) type!: 'FIXED' | 'COMMITTEE';
  @ApiProperty({ nullable: true }) budgetId!: number | null;
  @ApiProperty({ enum: ['DRAFT', 'APPROVED', 'CLOSED'], nullable: true })
  status!: 'DRAFT' | 'APPROVED' | 'CLOSED' | null;
  @ApiProperty({ nullable: true }) incomeIncreaseRate!: number | null;
  @ApiProperty({ type: [BudgetLineResponseDto] })
  lines!: BudgetLineResponseDto[];
  @ApiProperty({
    type: BudgetTotalsResponseDto,
    description: 'Ingresos y egresos juntos.',
  })
  totals!: BudgetTotalsResponseDto;
  @ApiProperty({ type: BudgetTotalsResponseDto })
  incomeTotals!: BudgetTotalsResponseDto;
  @ApiProperty({ type: BudgetTotalsResponseDto })
  expenseTotals!: BudgetTotalsResponseDto;
  @ApiProperty({
    type: [CommitteeGroupResponseDto],
    description: 'Solo el presupuesto por comités.',
  })
  groups!: CommitteeGroupResponseDto[];
}

export class BudgetAccountOptionResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: '410505 · Diezmos' }) label!: string;
  @ApiProperty({ enum: ['INCOME', 'EXPENSE'] }) nature!: 'INCOME' | 'EXPENSE';
}

export class BudgetFundOptionResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() label!: string;
}

export class BudgetOverviewResponseDto {
  @ApiProperty({ example: '2026-11-02' }) today!: string;
  @ApiProperty() year!: number;
  @ApiProperty({
    type: [Number],
    description: 'Del más reciente al más antiguo.',
  })
  years!: number[];
  @ApiProperty({ description: 'Falso al actuar sobre toda la denominación.' })
  congregationScoped!: boolean;
  @ApiProperty() congregationName!: string;
  @ApiProperty({
    description: 'Parte del año transcurrida (meses cerrados), de 0 a 100.',
  })
  expectedPct!: number;
  @ApiProperty({ type: BudgetViewResponseDto }) fixed!: BudgetViewResponseDto;
  @ApiProperty({ type: BudgetViewResponseDto })
  committee!: BudgetViewResponseDto;
  @ApiProperty({ type: [BudgetAccountOptionResponseDto] })
  accounts!: BudgetAccountOptionResponseDto[];
  @ApiProperty({ type: [BudgetFundOptionResponseDto] })
  funds!: BudgetFundOptionResponseDto[];
}

export class BudgetHeadResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() year!: number;
  @ApiProperty({ enum: BUDGET_TYPES }) type!: 'FIXED' | 'COMMITTEE';
  @ApiProperty({ enum: ['DRAFT', 'APPROVED', 'CLOSED'] }) status!:
    'DRAFT' | 'APPROVED' | 'CLOSED';
  @ApiProperty({ nullable: true }) incomeIncreaseRate!: number | null;
}

export class CopyBudgetResponseDto {
  @ApiProperty() budgetId!: number;
  @ApiProperty() copied!: number;
  @ApiProperty({
    description:
      'Líneas que ya estaban en el destino o cuya cuenta o fondo ya no está activo.',
  })
  skipped!: number;
}

export class BudgetMonthResponseDto {
  @ApiProperty({ minimum: 1, maximum: 12 }) month!: number;
  @ApiProperty({
    description: 'Valor mensual de la línea o una doceava parte del anual.',
  })
  planned!: number;
  @ApiProperty() executed!: number;
}

export class BudgetMovementResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: '2026-10-04' }) postedOn!: string;
  @ApiProperty({ enum: ['IN', 'OUT'] }) direction!: 'IN' | 'OUT';
  @ApiProperty() amount!: number;
  @ApiProperty() description!: string;
}

export class BudgetLineDetailResponseDto {
  @ApiProperty({ type: BudgetLineResponseDto }) line!: BudgetLineResponseDto;
  @ApiProperty() year!: number;
  @ApiProperty({ enum: BUDGET_TYPES }) type!: 'FIXED' | 'COMMITTEE';
  @ApiProperty({ enum: ['DRAFT', 'APPROVED', 'CLOSED'] }) status!:
    'DRAFT' | 'APPROVED' | 'CLOSED';
  @ApiProperty({ type: [BudgetMonthResponseDto] })
  months!: BudgetMonthResponseDto[];
  @ApiProperty({
    type: [BudgetMovementResponseDto],
    description: 'Los 25 más recientes.',
  })
  movements!: BudgetMovementResponseDto[];
}
