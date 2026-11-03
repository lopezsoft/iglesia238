import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  PageQueryDto,
  PageResponseDto,
} from '../../../common/pagination/page.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Catalog codes are upper-case words (SUNDAY_SCHOOL). Filters reach a file name, so nothing else gets in. */
const MEETING_TYPE_CODE = /^[A-Z][A-Z0-9_]{0,29}$/;
const MEETING_TYPE_CODE_MESSAGE = 'El tipo de reunión no es válido.';
const DATE_MESSAGE = 'Indica una fecha válida (aaaa-mm-dd).';

// ---------- Requests ----------

export class AttendanceCountDto {
  @ApiProperty({ example: 'CHILDREN' })
  @IsString({ message: 'Indica la categoría.' })
  @MaxLength(30)
  categoryCode!: string;

  @ApiProperty({ minimum: 0, maximum: 2000, example: 40 })
  @IsNumber({}, { message: 'Ingresa un número entero.' })
  headcount!: number;
}

export class CreateAttendanceSessionDto {
  @ApiProperty({ description: 'Sede de la reunión.' })
  @Type(() => Number)
  @IsInt({ message: 'Selecciona la sede de la reunión.' })
  @Min(1)
  congregationId!: number;

  @ApiProperty({ example: 'SUNDAY_SCHOOL' })
  @IsString({ message: 'Selecciona el tipo de reunión.' })
  @MaxLength(30)
  meetingTypeCode!: string;

  @ApiProperty({ example: '2026-10-25', description: 'No puede ser futura.' })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  sessionDate!: string;

  @ApiProperty({
    type: [AttendanceCountDto],
    description:
      'Las categorías omitidas valen 0. Debe haber al menos un asistente.',
  })
  @IsArray({ message: 'Indica los asistentes por categoría.' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AttendanceCountDto)
  attendanceCounts!: AttendanceCountDto[];
}

export class UpdateAttendanceCountsDto {
  @ApiProperty({ type: [AttendanceCountDto] })
  @IsArray({ message: 'Indica los asistentes por categoría.' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AttendanceCountDto)
  attendanceCounts!: AttendanceCountDto[];
}

/** Filters shared by the list, the export and the statistics. */
export class AttendanceFilterQueryDto {
  @ApiPropertyOptional({
    description: 'Sede. Obligatoria solo para consultar una sede concreta.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  congregationId?: number;

  @ApiPropertyOptional({ example: 'SUNDAY_SCHOOL' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(MEETING_TYPE_CODE, { message: MEETING_TYPE_CODE_MESSAGE })
  meetingTypeCode?: string;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Fecha inicial, inclusive.',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Fecha final, inclusive.',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  to?: string;
}

export class ListAttendanceQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  congregationId?: number;

  @ApiPropertyOptional({ example: 'SUNDAY_SCHOOL' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(MEETING_TYPE_CODE, { message: MEETING_TYPE_CODE_MESSAGE })
  meetingTypeCode?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  to?: string;
}

export class AttendanceStatsQueryDto extends AttendanceFilterQueryDto {
  @ApiPropertyOptional({ enum: ['month', 'year'], default: 'month' })
  @IsOptional()
  @IsIn(['month', 'year'], { message: 'Agrupa por mes o por año.' })
  groupBy: 'month' | 'year' = 'month';
}

export class AttendanceLookupQueryDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  congregationId!: number;

  @ApiProperty({ example: 'SUNDAY_SCHOOL' })
  @IsString()
  @MaxLength(30)
  meetingTypeCode!: string;

  @ApiProperty({ example: '2026-10-25' })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  sessionDate!: string;
}

// ---------- Responses ----------

export class CatalogEntryDto {
  @ApiProperty({ example: 'SUNDAY_SCHOOL' }) code!: string;
  @ApiProperty({ example: 'Escuela Dominical' }) name!: string;
}

export class NamedOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
}

export class AttendanceOptionsResponseDto {
  @ApiProperty({ type: [NamedOptionDto] }) congregations!: NamedOptionDto[];
  @ApiProperty({ type: [CatalogEntryDto] }) meetingTypes!: CatalogEntryDto[];
  @ApiProperty({ type: [CatalogEntryDto] }) categories!: CatalogEntryDto[];
  @ApiProperty({ example: '2026-11-02', description: 'Hoy en Bogotá.' })
  today!: string;
  @ApiProperty({ example: 2000 }) maxHeadcount!: number;
}

export class AttendanceCountResponseDto {
  @ApiProperty() categoryCode!: string;
  @ApiProperty() headcount!: number;
}

export class AttendanceSessionResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty() congregationId!: number;
  @ApiProperty() congregationName!: string;
  @ApiProperty() meetingTypeCode!: string;
  @ApiProperty() meetingTypeName!: string;
  @ApiProperty({ example: '2026-10-25' }) sessionDate!: string;
  @ApiProperty({ type: [AttendanceCountResponseDto] })
  attendanceCounts!: AttendanceCountResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty({ nullable: true, type: String }) recordedBy!: string | null;
  @ApiProperty({ example: '2026-10-25T17:40:00.000Z' }) recordedAt!: string;
}

export class AttendancePageResponseDto extends PageResponseDto {
  @ApiProperty({ type: [AttendanceSessionResponseDto] })
  items!: AttendanceSessionResponseDto[];
}

export class AttendanceSeriesPointDto {
  @ApiProperty({ example: '2026-10', description: 'AAAA-MM o AAAA.' })
  period!: string;
  @ApiProperty() sessions!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Asistentes promedio por sesión.' })
  average!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byCategory!: Record<string, number>;
}

export class AttendanceBestSessionDto {
  @ApiProperty({ example: '2026-10-25' }) sessionDate!: string;
  @ApiProperty() total!: number;
}

export class AttendanceYearComparisonDto {
  @ApiProperty() year!: number;
  @ApiProperty() previousYear!: number;
  @ApiProperty({ nullable: true, type: Number }) average!: number | null;
  @ApiProperty({ nullable: true, type: Number }) previousAverage!:
    number | null;
  @ApiProperty({ nullable: true, type: Number }) changePercent!: number | null;
}

export class AttendanceStatsResponseDto {
  @ApiProperty({ enum: ['month', 'year'] }) groupBy!: 'month' | 'year';
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() sessionCount!: number;
  @ApiProperty({ type: [AttendanceSeriesPointDto] })
  series!: AttendanceSeriesPointDto[];
  @ApiProperty({ description: 'Asistentes promedio por sesión en el rango.' })
  average!: number;
  @ApiProperty({ nullable: true, type: AttendanceBestSessionDto })
  max!: AttendanceBestSessionDto | null;
  @ApiProperty({ type: AttendanceYearComparisonDto })
  yearOverYear!: AttendanceYearComparisonDto;
}
