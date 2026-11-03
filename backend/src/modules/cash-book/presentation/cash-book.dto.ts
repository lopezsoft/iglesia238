import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PageQueryDto,
  PageResponseDto,
} from '../../../common/pagination/page.js';
import type { ReversalBlock } from '../application/cash-book-rules.js';
import type { CashRowStatus } from '../application/cash-book.views.js';

const DIRECTIONS = ['IN', 'OUT'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'La fecha debe tener el formato AAAA-MM-DD.';
const REVERSAL_BLOCKS: ReversalBlock[] = [
  'IS_REVERSAL',
  'ALREADY_REVERSED',
  'CONTRIBUTION',
  'TITHE_SETTLEMENT',
  'CONSOLIDATION_PERIOD_CLOSED',
];

// --- Requests --------------------------------------------------------------------------------------

export class CashBookQueryDto extends PageQueryDto {
  @ApiProperty({ description: 'Fondo del libro.' })
  @Type(() => Number)
  @IsInt({ message: 'Elige el fondo.' })
  @Min(1)
  fundId!: number;

  @ApiProperty({ description: 'Periodo contable de la sede.' })
  @Type(() => Number)
  @IsInt({ message: 'Elige el periodo.' })
  @Min(1)
  periodId!: number;

  @ApiPropertyOptional({ enum: DIRECTIONS })
  @IsOptional()
  @IsIn(DIRECTIONS, { message: 'El sentido del movimiento no es válido.' })
  direction?: 'IN' | 'OUT';

  @ApiPropertyOptional({ description: 'Solo las líneas de esta cuenta.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  accountId?: number;

  @ApiPropertyOptional({
    description:
      'Texto a buscar en la descripción o en la cuenta (código o nombre).',
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class RecordMovementDto {
  @ApiProperty() @IsInt({ message: 'Elige el fondo.' }) @Min(1) fundId!: number;

  @ApiProperty({ enum: DIRECTIONS })
  @IsIn(DIRECTIONS, {
    message: 'Indica si el movimiento es una entrada o una salida.',
  })
  direction!: 'IN' | 'OUT';

  @ApiProperty({
    description:
      'Cuenta imputable: de ingreso para entradas, de egreso para salidas.',
  })
  @IsInt({ message: 'Elige la cuenta.' })
  @Min(1)
  accountId!: number;

  @ApiProperty({
    example: '2026-11-02',
    description: 'No puede ser posterior a hoy ni caer en un periodo cerrado.',
  })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  postedOn!: string;

  @ApiProperty({
    example: 398700.5,
    description: 'Siempre positivo; el sentido lo da `direction`.',
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El valor debe ser un número con máximo dos decimales.' },
  )
  amount!: number;

  @ApiProperty({ minLength: 3, maxLength: 255 })
  @IsString({ message: 'Describe el movimiento.' })
  @MaxLength(500)
  description!: string;
}

export class ReverseMovementDto {
  @ApiProperty({
    example: '2026-11-02',
    description: 'Fecha de la reversa; puede ser de otro periodo abierto.',
  })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  postedOn!: string;

  @ApiProperty({ minLength: 10, maxLength: 200 })
  @IsString({ message: 'Describe el motivo de la reversa.' })
  @MaxLength(400)
  reason!: string;
}

export class ConsolidationDateQueryDto {
  @ApiProperty({ example: '2026-11-02' })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  date!: string;
}

export class ConsolidateDto extends ConsolidationDateQueryDto {}

export class VoucherListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['REC', 'CI', 'CE', 'LD'] })
  @IsOptional()
  @IsIn(['REC', 'CI', 'CE', 'LD'], {
    message: 'El tipo de comprobante no es válido.',
  })
  type?: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  to?: string;

  @ApiPropertyOptional({ enum: ['ISSUED', 'VOIDED'] })
  @IsOptional()
  @IsIn(['ISSUED', 'VOIDED'], { message: 'El estado no es válido.' })
  status?: 'ISSUED' | 'VOIDED';

  @ApiPropertyOptional({ description: 'Número consecutivo del comprobante.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  number?: number;

  @ApiPropertyOptional({
    description: 'Sede, para sesiones con alcance de denominación.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  congregationId?: number;
}

export class VoucherDetailQueryDto {
  @ApiPropertyOptional({
    description: 'Sede, para sesiones con alcance de denominación.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  congregationId?: number;
}

// --- Responses -------------------------------------------------------------------------------------

export class CashFundOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
}

export class CashAccountOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['INCOME', 'EXPENSE'] }) nature!: 'INCOME' | 'EXPENSE';
}

export class CashPeriodDto {
  @ApiProperty() id!: number;
  @ApiProperty() year!: number;
  @ApiProperty() month!: number;
  @ApiProperty({ enum: ['OPEN', 'CLOSED'] }) status!: 'OPEN' | 'CLOSED';
  @ApiProperty({ example: 'Noviembre 2026' }) label!: string;
  @ApiProperty({ nullable: true, type: String }) closedAt!: string | null;
  @ApiProperty({ example: '2026-11-01' }) from!: string;
  @ApiProperty({ example: '2026-11-30' }) to!: string;
}

export class CashBookOptionsDto {
  @ApiProperty({ example: '2026-11-02', description: 'Hoy en America/Bogota.' })
  today!: string;
  @ApiProperty({ nullable: true, type: Number }) congregationId!: number | null;
  @ApiProperty() congregationName!: string;
  @ApiProperty({ type: [CashFundOptionDto] })
  funds!: readonly CashFundOptionDto[];
  @ApiProperty({ type: [CashPeriodDto] }) periods!: readonly CashPeriodDto[];
  @ApiProperty({ type: [CashAccountOptionDto] })
  accounts!: readonly CashAccountOptionDto[];
}

export class CashBookRowDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: '2026-11-02' }) postedOn!: string;
  @ApiProperty({ example: 'CE-2026-00045' }) voucherCode!: string;
  @ApiProperty() accountCode!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: DIRECTIONS }) direction!: 'IN' | 'OUT';
  @ApiProperty() amount!: number;
  @ApiProperty({ description: 'Saldo del fondo después de la línea.' })
  balance!: number;
  @ApiProperty({ enum: ['POSTED', 'REVERSED', 'REVERSAL'] })
  status!: CashRowStatus;
  @ApiProperty({ nullable: true, type: String }) relatedVoucherCode!:
    string | null;
  @ApiProperty({ nullable: true, enum: REVERSAL_BLOCKS })
  reversalBlock!: ReversalBlock | null;
}

export class PendingConsolidationDto {
  @ApiProperty() date!: string;
  @ApiProperty() count!: number;
  @ApiProperty() amount!: number;
}

export class OpenRangeDto {
  @ApiProperty() min!: string;
  @ApiProperty() max!: string;
}

export class CashBookViewDto {
  @ApiProperty() fundId!: number;
  @ApiProperty() fundName!: string;
  @ApiProperty() fundIsActive!: boolean;
  @ApiProperty({ type: CashPeriodDto }) period!: CashPeriodDto;
  @ApiProperty() opening!: number;
  @ApiProperty() income!: number;
  @ApiProperty() expense!: number;
  @ApiProperty() closing!: number;
  @ApiProperty({ description: 'Entradas del mes, con o sin filtros.' })
  inCount!: number;
  @ApiProperty({ description: 'Salidas del mes, con o sin filtros.' })
  outCount!: number;
  @ApiProperty({ type: [CashBookRowDto] }) rows!: readonly CashBookRowDto[];
  @ApiProperty({ description: 'Líneas que cumplen los filtros.' })
  totalRows!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({ type: PendingConsolidationDto })
  pendingToday!: PendingConsolidationDto;
  @ApiProperty({ nullable: true, type: String }) closeBlockedReason!:
    string | null;
  @ApiProperty({ example: 'CI-2026-00013' }) nextCashIn!: string;
  @ApiProperty({ example: 'CE-2026-00046' }) nextCashOut!: string;
  @ApiProperty({ type: OpenRangeDto, nullable: true })
  openRange!: OpenRangeDto | null;
}

export class CashMovementReceiptDto {
  @ApiProperty() transactionId!: number;
  @ApiProperty({ example: 'CE-2026-00045' }) voucherCode!: string;
  @ApiProperty({ enum: DIRECTIONS }) direction!: 'IN' | 'OUT';
  @ApiProperty() amount!: number;
}

export class ConsolidationGroupDto {
  @ApiProperty() accountId!: number;
  @ApiProperty() accountCode!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() fundId!: number;
  @ApiProperty() fundName!: string;
  @ApiProperty() count!: number;
  @ApiProperty() amount!: number;
}

export class ConsolidationPreviewDto {
  @ApiProperty() date!: string;
  @ApiProperty({ type: [ConsolidationGroupDto] })
  groups!: readonly ConsolidationGroupDto[];
  @ApiProperty() count!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ example: 'CI-2026-00013' }) nextVoucherCode!: string;
}

export class ConsolidationResultDto {
  @ApiProperty() voucherCode!: string;
  @ApiProperty() movements!: number;
  @ApiProperty() count!: number;
  @ApiProperty() total!: number;
}

export class VoucherListItemDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'REC-2026-01872' }) code!: string;
  @ApiProperty({ enum: ['REC', 'CI', 'CE', 'LD'] }) type!: string;
  @ApiProperty() typeLabel!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ example: '2026-11-02' }) issuedOn!: string;
  @ApiProperty() amount!: number;
  @ApiProperty({ enum: ['ISSUED', 'VOIDED'] }) status!: 'ISSUED' | 'VOIDED';
  @ApiProperty({ nullable: true, type: String }) voidReason!: string | null;
  @ApiProperty() movements!: number;
  @ApiProperty() contributions!: number;
}

export class VoucherPageDto extends PageResponseDto {
  @ApiProperty({ type: [VoucherListItemDto] })
  items!: readonly VoucherListItemDto[];
}

export class VoucherLineDto {
  @ApiProperty() id!: number;
  @ApiProperty() postedOn!: string;
  @ApiProperty() accountCode!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() fundName!: string;
  @ApiProperty({ enum: DIRECTIONS }) direction!: 'IN' | 'OUT';
  @ApiProperty() amount!: number;
  @ApiProperty() description!: string;
  @ApiProperty() isReversal!: boolean;
}

export class VoucherContributionDto {
  @ApiProperty() id!: number;
  @ApiProperty() receivedOn!: string;
  @ApiProperty() typeName!: string;
  @ApiProperty() amount!: number;
  @ApiProperty({ enum: ['RECORDED', 'VOIDED'] }) status!: 'RECORDED' | 'VOIDED';
}

export class VoucherDetailDto extends VoucherListItemDto {
  @ApiProperty({ type: [VoucherLineDto] }) lines!: readonly VoucherLineDto[];
  @ApiProperty({ type: [VoucherContributionDto] })
  contributionRows!: readonly VoucherContributionDto[];
}
