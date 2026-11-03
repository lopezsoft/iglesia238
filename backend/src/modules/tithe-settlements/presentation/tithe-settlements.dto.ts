import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import {
  PageQueryDto,
  PageResponseDto,
} from '../../../common/pagination/page.js';
import { NormalizedText } from '../../../common/validation/text-transforms.js';
import {
  MAX_VOID_REASON_LENGTH,
  MIN_VOID_REASON_LENGTH,
} from '../application/tithe-settlement.config.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Indica una fecha válida (aaaa-mm-dd).';

// ---------- Requests ----------

export class TitheRangeDto {
  @ApiProperty({ example: '2026-10-01', description: 'Primer día cubierto.' })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  from!: string;

  @ApiProperty({
    example: '2026-10-31',
    description: 'Último día cubierto; no puede ser posterior a hoy.',
  })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  to!: string;
}

export class VoidTitheSettlementDto {
  @ApiProperty({
    minLength: MIN_VOID_REASON_LENGTH,
    maxLength: MAX_VOID_REASON_LENGTH,
    example: 'Se omitieron transferencias del último día del rango',
  })
  @NormalizedText()
  @IsString({ message: 'Describe el motivo de la anulación.' })
  @Length(MIN_VOID_REASON_LENGTH, MAX_VOID_REASON_LENGTH, {
    message: `El motivo debe tener entre ${MIN_VOID_REASON_LENGTH} y ${MAX_VOID_REASON_LENGTH} caracteres.`,
  })
  reason!: string;
}

export class ListTitheSettlementsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['ISSUED', 'VOIDED'] })
  @IsOptional()
  @IsIn(['ISSUED', 'VOIDED'], { message: 'El estado no es válido.' })
  status?: 'ISSUED' | 'VOIDED';

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Liquidadas desde (inclusive).',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Liquidadas hasta (inclusive).',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  to?: string;
}

// ---------- Responses ----------

export class TitheRuleResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: '2026-01-01' }) effectiveFrom!: string;
  @ApiProperty({ example: 0.21, description: 'Fracción del bruto (0-1).' })
  nationalShareRate!: number;
  @ApiProperty({
    example: 0.03,
    description: 'Fracción del neto tras la participación nacional (0-1).',
  })
  localFundRate!: number;
  @ApiProperty({ description: 'Es el porcentaje vigente hoy.' })
  inForce!: boolean;
}

export class TitheRangeResponseDto {
  @ApiProperty({ example: '2026-10-01' }) from!: string;
  @ApiProperty({ example: '2026-10-31' }) to!: string;
}

export class TitheYearSummaryResponseDto {
  @ApiProperty() year!: number;
  @ApiProperty() issuedCount!: number;
  @ApiProperty() grossTithe!: number;
  @ApiProperty() nationalShare!: number;
  @ApiProperty() localFundShare!: number;
  @ApiProperty() pastorNet!: number;
}

export class TitheOverviewResponseDto {
  @ApiProperty({ example: '2026-11-02', description: 'Hoy en America/Bogota.' })
  today!: string;
  @ApiProperty({
    description:
      'Falso al actuar sobre toda la denominación: las liquidaciones son de una sede.',
  })
  congregationScoped!: boolean;
  @ApiProperty() congregationName!: string;
  @ApiProperty({ type: TitheRuleResponseDto, nullable: true })
  rule!: TitheRuleResponseDto | null;
  @ApiProperty({ type: TitheRangeResponseDto, nullable: true })
  lastIssued!: TitheRangeResponseDto | null;
  @ApiProperty({ type: TitheYearSummaryResponseDto, nullable: true })
  yearSummary!: TitheYearSummaryResponseDto | null;
}

export class TitheBookingResponseDto {
  @ApiProperty() accountCode!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() fundName!: string;
}

export class TitheComponentResponseDto {
  @ApiProperty({ enum: ['NATIONAL', 'LOCAL_FUND', 'PASTOR'] })
  key!: 'NATIONAL' | 'LOCAL_FUND' | 'PASTOR';
  @ApiProperty({ description: 'Participación efectiva sobre el bruto (0-1).' })
  rate!: number;
  @ApiProperty() amount!: number;
  @ApiProperty({
    type: TitheBookingResponseDto,
    nullable: true,
    description:
      'Cuenta y fondo del egreso de caja; nulo si el componente no genera movimiento.',
  })
  booking!: TitheBookingResponseDto | null;
}

export class TitheContributionResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty({ nullable: true, example: 'REC-2026-00012' }) receiptNumber!:
    string | null;
  @ApiProperty({ example: '2026-10-04' }) receivedOn!: string;
  @ApiProperty({ nullable: true }) contributorName!: string | null;
  @ApiProperty({ nullable: true, example: 'SC-0130' }) memberCode!:
    string | null;
  @ApiProperty({
    enum: ['CASH', 'BANK_TRANSFER', 'CARD', 'BANK_DEPOSIT', 'OTHER'],
  })
  paymentMethod!: string;
  @ApiProperty() amount!: number;
}

export class TithePreviewResponseDto extends TitheRangeResponseDto {
  @ApiProperty() congregationName!: string;
  @ApiProperty() denominationName!: string;
  @ApiProperty({ nullable: true }) localFundName!: string | null;
  @ApiProperty() count!: number;
  @ApiProperty() contributorCount!: number;
  @ApiProperty() anonymousCount!: number;
  @ApiProperty({
    description: 'Diezmos anulados del rango, excluidos del bruto.',
  })
  excludedCount!: number;
  @ApiProperty() grossTithe!: number;
  @ApiProperty({ type: TitheRuleResponseDto }) rule!: TitheRuleResponseDto;
  @ApiProperty({ type: [TitheComponentResponseDto] })
  components!: TitheComponentResponseDto[];
  @ApiProperty({ description: 'Siempre igual al bruto.' })
  componentsTotal!: number;
  @ApiProperty({
    type: [TitheContributionResponseDto],
    description: 'Del más antiguo al más reciente.',
  })
  contributions!: TitheContributionResponseDto[];
  @ApiProperty({
    example: 'LD-2026-00002',
    description: 'Estimado: el número se reserva al confirmar.',
  })
  nextNumber!: string;
}

export class TitheSettlementResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'LD-2026-00001' }) number!: string;
  @ApiProperty({ example: '2026-10-01' }) coveredFrom!: string;
  @ApiProperty({ example: '2026-10-31' }) coveredTo!: string;
  @ApiProperty({ example: '2026-11-02' }) settledOn!: string;
  @ApiProperty() grossTithe!: number;
  @ApiProperty() nationalShare!: number;
  @ApiProperty() localFundShare!: number;
  @ApiProperty() pastorNet!: number;
  @ApiProperty({ description: 'Porcentaje nacional copiado al emitir.' })
  nationalShareRate!: number;
  @ApiProperty({ description: 'Porcentaje del fondo local copiado al emitir.' })
  localFundRate!: number;
  @ApiProperty({ description: '0 cuando la liquidación está anulada.' })
  contributionCount!: number;
  @ApiProperty({ enum: ['ISSUED', 'VOIDED'] }) status!: 'ISSUED' | 'VOIDED';
  @ApiProperty({ nullable: true }) voidReason!: string | null;
  @ApiProperty({ nullable: true }) voidedAt!: string | null;
}

export class TitheSettlementPageResponseDto extends PageResponseDto {
  @ApiProperty({ type: [TitheSettlementResponseDto] })
  items!: TitheSettlementResponseDto[];
}

export class SettlementCashLineResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: '2026-11-02' }) postedOn!: string;
  @ApiProperty({ enum: ['IN', 'OUT'] }) direction!: 'IN' | 'OUT';
  @ApiProperty() amount!: number;
  @ApiProperty() description!: string;
  @ApiProperty() accountCode!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() fundName!: string;
  @ApiProperty({ description: 'Reversa generada al anular la liquidación.' })
  isReversal!: boolean;
}

export class TitheSettlementDetailResponseDto extends TitheSettlementResponseDto {
  @ApiProperty() congregationName!: string;
  @ApiProperty({ nullable: true }) voidedByName!: string | null;
  @ApiProperty({ type: [TitheContributionResponseDto] })
  contributions!: TitheContributionResponseDto[];
  @ApiProperty({ type: [SettlementCashLineResponseDto] })
  cashLines!: SettlementCashLineResponseDto[];
}
