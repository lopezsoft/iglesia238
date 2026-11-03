import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  DASHBOARD_PERIODS,
  type DashboardPeriod,
  type DashboardTab,
  type WidgetFormat,
  type WidgetTone,
} from '../application/dashboard.types.js';

const TONES = ['cyan', 'green', 'orange', 'red', 'indigo', 'slate'] as const;
const FORMATS = ['currency', 'integer', 'text'] as const;
const TABS = ['general', 'indicators'] as const;

export class DashboardQueryDto {
  @ApiPropertyOptional({ enum: DASHBOARD_PERIODS, default: 'today' })
  @IsOptional()
  @IsIn(DASHBOARD_PERIODS, {
    message: 'El periodo debe ser today, yesterday, 7d o month.',
  })
  period?: DashboardPeriod;
}

export class DateRangeDto {
  @ApiProperty({ example: '2026-11-01' }) from!: string;
  @ApiProperty({ example: '2026-11-02' }) to!: string;
}

export class ScopeInfoDto {
  @ApiProperty({ enum: ['PLATFORM', 'DENOMINATION', 'CONGREGATION'] })
  kind!: 'PLATFORM' | 'DENOMINATION' | 'CONGREGATION';

  @ApiProperty({ example: 'Sede Norte' }) label!: string;

  @ApiProperty({ nullable: true, type: String }) denominationName!:
    string | null;
}

export class HeroWidgetDto {
  @ApiProperty() key!: string;
  @ApiProperty({ description: 'Gana el hero de mayor prioridad.' })
  priority!: number;
  @ApiProperty() eyebrow!: string;
  @ApiProperty() title!: string;
  @ApiProperty() label!: string;
  @ApiProperty() value!: number;
  @ApiProperty({ enum: ['currency', 'integer'] }) format!:
    'currency' | 'integer';

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Valor del periodo de comparación; null si no se puede saber.',
  })
  previous!: number | null;

  @ApiProperty({
    type: [Number],
    description:
      'Un valor por día del periodo; vacío si no hay historia que dibujar.',
  })
  series!: readonly number[];

  @ApiProperty({ nullable: true, type: String }) link!: string | null;
}

export class KpiWidgetDto {
  @ApiProperty() key!: string;
  @ApiProperty() order!: number;
  @ApiProperty({ enum: TABS }) tab!: DashboardTab;
  @ApiProperty() label!: string;
  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'string' }] })
  value!: number | string;
  @ApiProperty({ enum: FORMATS }) format!: WidgetFormat;
  @ApiProperty({ nullable: true, type: String }) hint!: string | null;
  @ApiProperty({ example: 'users' }) icon!: string;
  @ApiProperty({ enum: TONES }) tone!: WidgetTone;
  @ApiProperty({ nullable: true, type: String }) link!: string | null;
  @ApiProperty({ nullable: true, type: Number }) previous!: number | null;
}

export class PanelStatDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'string' }] })
  value!: number | string;
  @ApiProperty({ enum: FORMATS }) format!: WidgetFormat;
  @ApiProperty({ nullable: true, type: String }) meta!: string | null;
  @ApiProperty() icon!: string;
  @ApiProperty({ enum: TONES }) tone!: WidgetTone;
}

export class PanelWidgetDto {
  @ApiProperty() key!: string;
  @ApiProperty() order!: number;
  @ApiProperty({ enum: TABS }) tab!: DashboardTab;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) subtitle!: string | null;
  @ApiProperty() icon!: string;
  @ApiProperty({ enum: TONES }) tone!: WidgetTone;
  @ApiProperty({ nullable: true, type: String }) link!: string | null;
  @ApiProperty({ nullable: true, type: String }) linkLabel!: string | null;
  @ApiProperty({ type: [PanelStatDto] }) stats!: readonly PanelStatDto[];
}

export class ListBadgeDto {
  @ApiProperty() label!: string;
  @ApiProperty({ enum: TONES }) tone!: WidgetTone;
}

export class ListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) subtitle!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'ISO 8601.' })
  occurredAt!: string | null;
  @ApiProperty({ nullable: true, type: ListBadgeDto })
  badge!: ListBadgeDto | null;
}

export class ListWidgetDto {
  @ApiProperty() key!: string;
  @ApiProperty() order!: number;
  @ApiProperty({ enum: TABS }) tab!: DashboardTab;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) subtitle!: string | null;
  @ApiProperty() icon!: string;
  @ApiProperty({ enum: TONES }) tone!: WidgetTone;
  @ApiProperty() emptyText!: string;
  @ApiProperty({ nullable: true, type: String }) link!: string | null;
  @ApiProperty({ nullable: true, type: String }) linkLabel!: string | null;
  @ApiProperty({ type: [ListItemDto] }) items!: readonly ListItemDto[];
}

export class TrendPointDto {
  @ApiProperty({ example: 'Nov' }) label!: string;
  @ApiProperty() value!: number;
}

export class TrendWidgetDto {
  @ApiProperty() key!: string;
  @ApiProperty() order!: number;
  @ApiProperty({ enum: TABS }) tab!: DashboardTab;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) subtitle!: string | null;
  @ApiProperty({ enum: ['currency', 'integer'] }) format!:
    'currency' | 'integer';
  @ApiProperty({ enum: TONES }) tone!: WidgetTone;
  @ApiProperty({ type: [TrendPointDto] }) points!: readonly TrendPointDto[];
}

export class DashboardSummaryResponseDto {
  @ApiProperty({ enum: DASHBOARD_PERIODS }) period!: DashboardPeriod;
  @ApiProperty({ example: 'Hoy' }) periodLabel!: string;
  @ApiProperty({ example: 'ayer' }) previousLabel!: string;
  @ApiProperty({ example: '2026-11-02', description: 'Hoy en Bogotá.' })
  asOf!: string;
  @ApiProperty({ type: DateRangeDto }) range!: DateRangeDto;
  @ApiProperty({ type: ScopeInfoDto }) scope!: ScopeInfoDto;
  @ApiProperty({ nullable: true, type: HeroWidgetDto })
  hero!: HeroWidgetDto | null;
  @ApiProperty({ type: [KpiWidgetDto] }) kpis!: readonly KpiWidgetDto[];
  @ApiProperty({ type: [PanelWidgetDto] }) panels!: readonly PanelWidgetDto[];
  @ApiProperty({ type: [ListWidgetDto] }) lists!: readonly ListWidgetDto[];
  @ApiProperty({ type: [TrendWidgetDto] }) trends!: readonly TrendWidgetDto[];
  @ApiProperty({
    type: [String],
    description: 'Proveedores que fallaron: faltan sus cifras.',
  })
  unavailable!: readonly string[];
}
