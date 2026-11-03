import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Indica una fecha válida (aaaa-mm-dd).';

// ---------- Requests ----------

export class PendingConsolidationDto {
  @ApiProperty() count!: number;
  @ApiProperty() amount!: number;
}

export class ReportQueryDto {
  @ApiProperty({ example: '2026-01-01' })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  from!: string;

  @ApiProperty({
    example: '2026-12-31',
    description: 'Del mismo año que «from».',
  })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  to!: string;

  @ApiPropertyOptional({ description: 'Un solo fondo; si se omite, todos.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El fondo no es válido.' })
  @Min(1)
  fundId?: number;

  @ApiPropertyOptional({
    description:
      'Una sola sede (solo con alcance de denominación); si se omite, todas las del alcance.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La sede no es válida.' })
  @Min(1)
  congregationId?: number;
}

// ---------- Responses ----------

export class ReportFundOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
}

export class ReportCongregationOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
}

export class ReportOptionsResponseDto {
  @ApiProperty({ example: 'Sede Central' }) scopeLabel!: string;
  @ApiProperty({
    description:
      'Verdadero para «toda la denominación»: se suman todas las sedes.',
  })
  denominationWide!: boolean;
  @ApiProperty({ type: [ReportFundOptionDto] }) funds!: ReportFundOptionDto[];
  @ApiProperty({
    type: [ReportCongregationOptionDto],
    description: 'Sedes a las que se puede acotar el reporte.',
  })
  congregations!: ReportCongregationOptionDto[];
  @ApiProperty({ example: '2026-11-02', description: 'Hoy en America/Bogota.' })
  today!: string;
}

export class MoneyTotalsDto {
  @ApiProperty() income!: number;
  @ApiProperty() expense!: number;
  @ApiProperty({ description: 'Ingresos menos egresos.' }) balance!: number;
}

export class ReportQueryResponseDto {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty({ nullable: true }) fundId!: number | null;
  @ApiProperty({ nullable: true }) congregationId!: number | null;
}

export class PreviousTotalsDto extends MoneyTotalsDto {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
}

export class ReportMonthDto extends MoneyTotalsDto {
  @ApiProperty() year!: number;
  @ApiProperty() month!: number;
  @ApiProperty({ example: 'Octubre 2026' }) label!: string;
  @ApiProperty({ example: 'Oct.' }) shortLabel!: string;
  @ApiProperty({ enum: ['OPEN', 'CLOSED'], nullable: true }) periodStatus!:
    'OPEN' | 'CLOSED' | null;
}

export class ReportFundBalanceDto {
  @ApiProperty() fundId!: number;
  @ApiProperty() name!: string;
  @ApiProperty() opening!: number;
  @ApiProperty() inflows!: number;
  @ApiProperty() outflows!: number;
  @ApiProperty({ description: 'Saldo inicial + entradas - salidas.' })
  closing!: number;
}

export class ReportAccountDto {
  @ApiProperty() accountId!: number;
  @ApiProperty({ example: '410505' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['INCOME', 'EXPENSE'] }) nature!: 'INCOME' | 'EXPENSE';
  @ApiProperty() amount!: number;
}

export class ReportContributionTypeDto {
  @ApiProperty() contributionTypeId!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['TITHE', 'OFFERING', 'FIRST_FRUITS', 'VOW', 'OTHER'] })
  category!: 'TITHE' | 'OFFERING' | 'FIRST_FRUITS' | 'VOW' | 'OTHER';
  @ApiProperty() count!: number;
  @ApiProperty() amount!: number;
  @ApiProperty({ description: 'Fracción (0-1) del total de aportes.' })
  share!: number;
}

export class ReportCongregationDto extends MoneyTotalsDto {
  @ApiProperty() congregationId!: number;
  @ApiProperty() name!: string;
}

export class FinancialReportResponseDto {
  @ApiProperty({ type: ReportQueryResponseDto }) query!: ReportQueryResponseDto;
  @ApiProperty() scopeLabel!: string;
  @ApiProperty({ example: 'Todos los fondos' }) fundLabel!: string;
  @ApiProperty({ type: MoneyTotalsDto }) totals!: MoneyTotalsDto;
  @ApiProperty({
    type: PreviousTotalsDto,
    description: 'Mismos días inmediatamente antes de «from».',
  })
  previous!: PreviousTotalsDto;
  @ApiProperty({ type: [ReportMonthDto] }) months!: ReportMonthDto[];
  @ApiProperty({ type: [ReportFundBalanceDto] }) funds!: ReportFundBalanceDto[];
  @ApiProperty({
    type: [ReportAccountDto],
    description: 'Estado de resultados por cuenta, por código.',
  })
  accounts!: ReportAccountDto[];
  @ApiProperty({ type: [ReportContributionTypeDto] })
  contributionTypes!: ReportContributionTypeDto[];
  @ApiProperty() contributionsTotal!: number;
  @ApiProperty() contributionsCount!: number;
  @ApiProperty({
    type: PendingConsolidationDto,
    description:
      'Aportes registrados en el rango que el libro de caja aún no consolida: no están en los ingresos de caja, los saldos ni el flujo mensual.',
  })
  pendingConsolidation!: PendingConsolidationDto;
  @ApiProperty({
    description: 'Ingresos en cuentas que no son un tipo de aporte.',
  })
  otherIncome!: number;
  @ApiProperty({
    type: [ReportCongregationDto],
    nullable: true,
    description: 'Solo con alcance de denominación.',
  })
  congregations!: ReportCongregationDto[] | null;
  @ApiProperty() closedPeriods!: number;
  @ApiProperty() openPeriods!: number;
}
