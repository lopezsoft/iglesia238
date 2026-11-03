import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  MAX_NOTES_LENGTH,
  MAX_REASON_LENGTH,
  MAX_REFERENCE_LENGTH,
  MIN_REASON_LENGTH,
} from '../../../common/accounting/input-validation.js';
import { MAX_MONEY_AMOUNT } from '../../../common/accounting/accounting-rules.js';
import {
  PageQueryDto,
  PageResponseDto,
} from '../../../common/pagination/page.js';
import { NormalizedOptionalText } from '../../../common/validation/text-transforms.js';
import {
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_DISPLAY_STATUSES,
  PAYMENT_METHODS,
} from '../domain/contribution.types.js';
import type {
  ContributionCategory,
  ContributionDisplayStatus,
  ContributionVoidBlock,
  PaymentMethod,
  PeriodStatus,
} from '../domain/contribution.types.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = 'La fecha debe tener el formato AAAA-MM-DD.';

/** Query string numbers arrive as text; empty means "not sent". */
const toOptionalInt = ({ value }: { value: unknown }): unknown =>
  value === undefined || value === '' ? undefined : Number(value);

// --- Requests --------------------------------------------------------------------------------------

export class ContributionFilterQueryDto {
  @ApiPropertyOptional({
    description: 'Año del periodo (con month).',
    example: 2026,
  })
  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 12,
    description: 'Mes del periodo.',
  })
  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({
    description: 'Inicio del rango (AAAA-MM-DD). Con "to" reemplaza al mes.',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ description: 'Fin del rango (AAAA-MM-DD).' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  to?: string;

  @ApiPropertyOptional({ enum: CONTRIBUTION_CATEGORIES })
  @IsOptional()
  @IsIn(CONTRIBUTION_CATEGORIES, { message: 'La categoría no es válida.' })
  category?: ContributionCategory;

  @ApiPropertyOptional({ description: 'Tipo de aporte concreto.' })
  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  contributionTypeId?: number;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS, { message: 'El medio de pago no es válido.' })
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ enum: CONTRIBUTION_DISPLAY_STATUSES })
  @IsOptional()
  @IsIn(CONTRIBUTION_DISPLAY_STATUSES, { message: 'El estado no es válido.' })
  status?: ContributionDisplayStatus;

  @ApiPropertyOptional({
    description:
      'Recibo (REC-2026-00012 o 12), aportante, referencia o descripción.',
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({
    description: 'Solo para sesiones de toda la denominación: filtra una sede.',
  })
  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  congregationId?: number;
}

export class ListContributionsQueryDto extends IntersectionType(
  PageQueryDto,
  ContributionFilterQueryDto,
) {}

export class RecordContributionDto {
  @ApiProperty({ description: 'Tipo de aporte activo de la denominación.' })
  @IsInt({ message: 'Selecciona el tipo de aporte.' })
  @Min(1)
  contributionTypeId!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Null para aportes anónimos y colectas agregadas.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  personId?: number | null;

  @ApiProperty({ example: '2026-11-02' })
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  receivedOn!: string;

  @ApiProperty({
    example: 250000,
    description: 'Pesos colombianos, hasta dos decimales.',
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El valor admite hasta dos decimales.' },
  )
  @IsPositive({ message: 'El valor debe ser mayor que cero.' })
  @Max(MAX_MONEY_AMOUNT, { message: 'El valor es demasiado grande.' })
  amount!: number;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS, { message: 'El medio de pago no es válido.' })
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: MAX_REFERENCE_LENGTH,
    description: 'Obligatoria para transferencia, datáfono y consignación.',
  })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REFERENCE_LENGTH)
  paymentReference?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Promesa de voto a la que se abona (solo tipos de categoría Voto).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  vowPledgeId?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: MAX_NOTES_LENGTH,
    description: 'Descripción de la colecta u observación.',
  })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  notes?: string | null;
}

export class VoidContributionDto {
  @ApiProperty({
    minLength: MIN_REASON_LENGTH,
    maxLength: MAX_REASON_LENGTH,
    example:
      'Valor digitado con error; se registra de nuevo con el valor correcto.',
  })
  @IsString()
  @MinLength(MIN_REASON_LENGTH, {
    message: `Describe el motivo de la anulación (mínimo ${MIN_REASON_LENGTH} caracteres).`,
  })
  @MaxLength(MAX_REASON_LENGTH)
  reason!: string;
}

export class SearchContributorsQueryDto {
  @ApiProperty({
    minLength: 2,
    maxLength: 80,
    description: 'Nombre, documento o código de miembro (SC-0148).',
  })
  @IsString()
  @MaxLength(80)
  q!: string;
}

// --- Responses -------------------------------------------------------------------------------------

export class ContributionRowDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'REC-2026-01872' }) receiptNumber!: string;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Comprobante del recibo: con él se descarga el PDF.',
  })
  voucherId!: number | null;
  @ApiProperty({ example: '2026-11-02' }) receivedOn!: string;
  @ApiProperty() contributionTypeId!: number;
  @ApiProperty() typeName!: string;
  @ApiProperty({ enum: CONTRIBUTION_CATEGORIES })
  category!: ContributionCategory;
  @ApiProperty({ nullable: true, type: Number }) personId!: number | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Nombre y primer apellido; null si es anónimo o colecta.',
  })
  contributorName!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'SC-0130' })
  memberCode!: string | null;
  @ApiProperty({ nullable: true, type: Number }) vowPledgeId!: number | null;
  @ApiProperty({ nullable: true, type: String, example: 'VOTO-2026-0014' })
  vowPledgeCode!: string | null;
  @ApiProperty({ enum: PAYMENT_METHODS }) paymentMethod!: PaymentMethod;
  @ApiProperty({ nullable: true, type: String }) paymentReference!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty() amount!: number;
  @ApiProperty({ enum: CONTRIBUTION_DISPLAY_STATUSES })
  status!: ContributionDisplayStatus;
  @ApiProperty({
    nullable: true,
    enum: ['SETTLED', 'CONSOLIDATED'],
    description: 'Por qué no se puede anular, o null si se puede.',
  })
  voidBlock!: ContributionVoidBlock | null;
  @ApiProperty({ nullable: true, type: String }) voidReason!: string | null;
  @ApiProperty() congregationName!: string;
}

export class ContributionDetailDto extends ContributionRowDto {
  @ApiProperty({ description: 'ISO 8601.' }) recordedAt!: string;
  @ApiProperty({ nullable: true, type: String }) recordedByName!: string | null;
  @ApiProperty({ nullable: true, type: String }) voidedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) voidedByName!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'CI-2026-00012' })
  consolidationVoucher!: string | null;
  @ApiProperty({ nullable: true, type: Number }) settlementId!: number | null;
}

export class CategorySummaryDto {
  @ApiProperty({ enum: CONTRIBUTION_CATEGORIES })
  category!: ContributionCategory;
  @ApiProperty() amount!: number;
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'Porcentaje entero del total.' }) share!: number;
}

export class ContributionListingDto extends PageResponseDto {
  @ApiProperty({ type: [ContributionRowDto] }) items!: ContributionRowDto[];
  @ApiProperty({ example: '2026-11-01' }) from!: string;
  @ApiProperty({ example: '2026-11-30' }) to!: string;
  @ApiProperty({ example: 'Noviembre 2026' }) label!: string;
  @ApiProperty({ nullable: true, enum: ['OPEN', 'CLOSED'] })
  periodStatus!: PeriodStatus | null;
  @ApiProperty({ type: [CategorySummaryDto] }) summary!: CategorySummaryDto[];
  @ApiProperty({
    description: 'Total de los aportes vigentes (sin anulados) del filtro.',
  })
  totalAmount!: number;
  @ApiProperty() voidedCount!: number;
}

export class ContributionTypeOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: CONTRIBUTION_CATEGORIES })
  category!: ContributionCategory;
}

export class PeriodOptionDto {
  @ApiProperty() year!: number;
  @ApiProperty() month!: number;
  @ApiProperty({ enum: ['OPEN', 'CLOSED'] }) status!: PeriodStatus;
  @ApiProperty({ example: 'Noviembre 2026' }) label!: string;
}

export class DateRangeDto {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
}

export class ContributionFormOptionsDto {
  @ApiProperty({ example: '2026-11-02', description: 'Hoy en Bogotá.' })
  today!: string;
  @ApiProperty() congregationScoped!: boolean;
  @ApiProperty() scopeLabel!: string;
  @ApiProperty({ type: [ContributionTypeOptionDto] })
  types!: ContributionTypeOptionDto[];
  @ApiProperty({ type: [PeriodOptionDto] }) periods!: PeriodOptionDto[];
  @ApiProperty({ nullable: true, type: String }) minDate!: string | null;
  @ApiProperty({ nullable: true, type: String }) maxDate!: string | null;
  @ApiProperty({ type: [DateRangeDto] }) settledTitheRanges!: DateRangeDto[];
  @ApiProperty({ nullable: true, type: String, example: 'REC-2026-01873' })
  nextReceiptNumber!: string | null;
}

export class PersonOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty({ example: 'SC-0130' }) memberCode!: string;
  @ApiProperty() congregationName!: string;
  @ApiProperty({
    example: 'CC ···1904',
    description: 'Tipo y últimos dígitos: nunca el documento completo.',
  })
  documentHint!: string;
}
