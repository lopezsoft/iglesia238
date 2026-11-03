import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
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
import { MAX_MONEY_AMOUNT } from '../../../common/accounting/accounting-rules.js';
import {
  MAX_NOTES_LENGTH,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
} from '../../../common/accounting/input-validation.js';
import {
  PageQueryDto,
  PageResponseDto,
} from '../../../common/pagination/page.js';
import { NormalizedOptionalText } from '../../../common/validation/text-transforms.js';
import {
  CONTRIBUTION_DISPLAY_STATUSES,
  PAYMENT_METHODS,
} from '../../contributions/domain/contribution.types.js';
import type {
  ContributionDisplayStatus,
  PaymentMethod,
} from '../../contributions/domain/contribution.types.js';
import { PersonOptionDto } from '../../contributions/presentation/contributions.dto.js';
import { VOW_PLEDGE_STATUSES } from '../domain/vow-pledge-rules.js';
import type { VowPledgeStatus } from '../domain/vow-pledge-rules.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = 'La fecha debe tener el formato AAAA-MM-DD.';

const toOptionalInt = ({ value }: { value: unknown }): unknown =>
  value === undefined || value === '' ? undefined : Number(value);

const toOptionalBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : undefined;

// --- Requests --------------------------------------------------------------------------------------

export class VowFilterQueryDto {
  @ApiPropertyOptional({ enum: VOW_PLEDGE_STATUSES })
  @IsOptional()
  @IsIn(VOW_PLEDGE_STATUSES, { message: 'El estado no es válido.' })
  status?: VowPledgeStatus;

  @ApiPropertyOptional({ description: 'Tipo de aporte (categoría Voto).' })
  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  contributionTypeId?: number;

  @ApiPropertyOptional({
    maxLength: 80,
    description:
      'Persona, código de miembro (SC-0148), documento o código de promesa (VOTO-2026-0014).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({
    description: 'Solo promesas activas con fecha límite vencida.',
  })
  @Transform(toOptionalBoolean)
  @IsOptional()
  @IsBoolean()
  overdueOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Solo para sesiones de toda la denominación: filtra una sede.',
  })
  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  congregationId?: number;
}

export class ListVowPledgesQueryDto extends IntersectionType(
  PageQueryDto,
  VowFilterQueryDto,
) {}

export class OpenPledgesQueryDto {
  @ApiProperty()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  personId!: number;

  @ApiProperty()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  contributionTypeId!: number;
}

export class CreateVowPledgeDto {
  @ApiProperty()
  @IsInt({ message: 'Selecciona la persona que hace la promesa.' })
  @Min(1)
  personId!: number;

  @ApiProperty({ description: 'Tipo de aporte activo de categoría Voto.' })
  @IsInt({ message: 'Selecciona el tipo de aporte.' })
  @Min(1)
  contributionTypeId!: number;

  @ApiProperty({ example: 500000 })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El valor admite hasta dos decimales.' },
  )
  @IsPositive({ message: 'El valor prometido debe ser mayor que cero.' })
  @Max(MAX_MONEY_AMOUNT, { message: 'El valor es demasiado grande.' })
  pledgedAmount!: number;

  @ApiProperty({ example: '2026-11-02' })
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  pledgedOn!: string;

  @ApiPropertyOptional({ nullable: true, example: '2027-06-30' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  dueOn?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: MAX_NOTES_LENGTH })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  description?: string | null;
}

/** Only the fields that are sent change. Null clears the due date and the observations. */
export class UpdateVowPledgeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El valor admite hasta dos decimales.' },
  )
  @IsPositive({ message: 'El valor prometido debe ser mayor que cero.' })
  @Max(MAX_MONEY_AMOUNT, { message: 'El valor es demasiado grande.' })
  pledgedAmount?: number;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  dueOn?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: MAX_NOTES_LENGTH })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  description?: string | null;
}

export class CancelVowPledgeDto {
  @ApiProperty({ minLength: MIN_REASON_LENGTH, maxLength: MAX_REASON_LENGTH })
  @IsString()
  @MinLength(MIN_REASON_LENGTH, {
    message: `Describe el motivo de la cancelación (mínimo ${MIN_REASON_LENGTH} caracteres).`,
  })
  @MaxLength(MAX_REASON_LENGTH)
  reason!: string;
}

// --- Responses -------------------------------------------------------------------------------------

export class VowPledgeRowDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'VOTO-2026-0014' }) code!: string;
  @ApiProperty() personId!: number;
  @ApiProperty() personName!: string;
  @ApiProperty({ example: 'SC-0130' }) memberCode!: string;
  @ApiProperty() contributionTypeId!: number;
  @ApiProperty() typeName!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() pledgedAmount!: number;
  @ApiProperty({ example: '2026-11-02' }) pledgedOn!: string;
  @ApiProperty({ nullable: true, type: String }) dueOn!: string | null;
  @ApiProperty({ description: 'Activa, con fecha límite vencida.' })
  isOverdue!: boolean;
  @ApiProperty({ description: 'Suma de los aportes no anulados.' })
  paid!: number;
  @ApiProperty() balance!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) progress!: number;
  @ApiProperty({ enum: VOW_PLEDGE_STATUSES }) status!: VowPledgeStatus;
  @ApiProperty({ nullable: true, type: String }) lastPaymentOn!: string | null;
  @ApiProperty() paymentCount!: number;
  @ApiProperty() congregationName!: string;
}

export class VowPaymentDto {
  @ApiProperty() id!: number;
  @ApiProperty() receivedOn!: string;
  @ApiProperty({ example: 'REC-2026-01872' }) receiptNumber!: string;
  @ApiProperty() amount!: number;
  @ApiProperty({ enum: PAYMENT_METHODS }) paymentMethod!: PaymentMethod;
  @ApiProperty({ enum: CONTRIBUTION_DISPLAY_STATUSES })
  status!: ContributionDisplayStatus;
  @ApiProperty({
    description:
      'Sede donde se recibió el abono (puede cambiar tras un traslado).',
  })
  congregationName!: string;
}

export class VowPledgeDetailDto extends VowPledgeRowDto {
  @ApiProperty({ example: 'CC ···1904' }) documentHint!: string;
  @ApiProperty() fundName!: string;
  @ApiProperty({
    type: [VowPaymentDto],
    description: 'Más reciente primero, con los anulados.',
  })
  payments!: VowPaymentDto[];
  @ApiProperty({ nullable: true, type: String }) cancelReason!: string | null;
}

export class VowTypeOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
}

export class VowKpisDto {
  @ApiProperty() pledgedTotal!: number;
  @ApiProperty() paidTotal!: number;
  @ApiProperty() balanceTotal!: number;
  @ApiProperty() pledgeCount!: number;
  @ApiProperty() withBalanceCount!: number;
  @ApiProperty() activeCount!: number;
  @ApiProperty({ description: 'Activas sin abonos en los últimos 90 días.' })
  staleCount!: number;
  @ApiProperty() overdueCount!: number;
}

export class VowStatusCountsDto {
  @ApiProperty() ALL!: number;
  @ApiProperty() ACTIVE!: number;
  @ApiProperty() FULFILLED!: number;
  @ApiProperty() CANCELLED!: number;
}

export class VowsOverviewDto extends PageResponseDto {
  @ApiProperty({ example: '2026-11-02' }) today!: string;
  @ApiProperty() congregationScoped!: boolean;
  @ApiProperty() scopeLabel!: string;
  @ApiProperty({ type: [VowTypeOptionDto] }) vowTypes!: VowTypeOptionDto[];
  @ApiProperty({ type: VowKpisDto }) kpis!: VowKpisDto;
  @ApiProperty({ type: VowStatusCountsDto }) statusCounts!: VowStatusCountsDto;
  @ApiProperty({ type: [VowPledgeRowDto] }) items!: VowPledgeRowDto[];
}

export class VowPledgeOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty({
    example: 'VOTO-2026-0014 · Ampliación del templo · saldo $ 450.000',
  })
  label!: string;
  @ApiProperty() personId!: number;
  @ApiProperty() contributionTypeId!: number;
  @ApiProperty() balance!: number;
}

export class VowPaymentTargetDto {
  @ApiProperty({ type: VowPledgeOptionDto }) pledge!: VowPledgeOptionDto;
  @ApiProperty({ type: PersonOptionDto }) person!: PersonOptionDto;
}
