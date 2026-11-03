import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PageQueryDto,
  PageResponseDto,
} from '../../../common/pagination/page.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = 'Escribe fechas válidas para el rango (aaaa-mm-dd).';
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;
const toInt = ({ value }: { value: unknown }): unknown =>
  value === undefined || value === '' ? undefined : Number(value);

export class ListAuditLogsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Día inicial (hora de Bogotá), inclusive.',
  })
  @Transform(emptyToNull)
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-30',
    description: 'Día final (hora de Bogotá), inclusive.',
  })
  @Transform(emptyToNull)
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  to?: string;

  @ApiPropertyOptional()
  @Transform(toInt)
  @IsOptional()
  @IsInt({ message: 'El usuario no es válido.' })
  @Min(1, { message: 'El usuario no es válido.' })
  userId?: number;

  @ApiPropertyOptional({ example: 'ROLE_GRANTED' })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  action?: string;

  @ApiPropertyOptional({ example: 'UserRole' })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entity?: string;
}

export class AuditFieldChangeDto {
  @ApiProperty() field!: string;
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
}

export class AuditEntryDto {
  @ApiProperty() id!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true }) userId!: number | null;
  @ApiProperty() userName!: string;
  @ApiProperty() action!: string;
  @ApiProperty() entity!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty({
    description: 'Nombre de la sede, "Toda la denominación" o "Plataforma".',
  })
  scopeLabel!: string;
  @ApiProperty({ description: 'Siempre enmascarada: 181.52.•••.•••' })
  ipAddress!: string;
  @ApiProperty({ type: [AuditFieldChangeDto] })
  changes!: AuditFieldChangeDto[];
}

export class AuditSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty() roleChanges!: number;
  @ApiProperty() contributionVoids!: number;
  @ApiProperty() periodClosures!: number;
}

export class AuditPageDto extends PageResponseDto {
  @ApiProperty({ type: [AuditEntryDto] }) items!: AuditEntryDto[];
  @ApiProperty({ type: AuditSummaryDto }) summary!: AuditSummaryDto;
}

export class AuditUserOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
}

export class AuditFilterOptionsDto {
  @ApiProperty({ type: [AuditUserOptionDto] }) users!: AuditUserOptionDto[];
  @ApiProperty({ type: [String] }) actions!: string[];
  @ApiProperty({ type: [String] }) entities!: string[];
}
