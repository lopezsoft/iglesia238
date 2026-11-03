import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  PageQueryDto,
  PageResponseDto,
} from '../../../common/pagination/page.js';
import { NormalizedText } from '../../../common/validation/text-transforms.js';
import { DENOMINATION_NAME_MAX_LENGTH } from '../application/denomination-rules.js';

export class ListDenominationsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Texto contenido en el nombre.' })
  @NormalizedText()
  @IsOptional()
  @IsString()
  @MaxLength(DENOMINATION_NAME_MAX_LENGTH)
  search: string = '';

  @ApiPropertyOptional({ enum: ['all', 'active', 'inactive'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'active', 'inactive'], {
    message: 'El estado debe ser all, active o inactive.',
  })
  status: 'all' | 'active' | 'inactive' = 'all';
}

export class DenominationNameBodyDto {
  @ApiProperty({ maxLength: DENOMINATION_NAME_MAX_LENGTH })
  @NormalizedText()
  @IsString({ message: 'El nombre de la denominación es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre de la denominación es obligatorio.' })
  @MaxLength(DENOMINATION_NAME_MAX_LENGTH, {
    message: `El nombre admite máximo ${DENOMINATION_NAME_MAX_LENGTH} caracteres.`,
  })
  name!: string;
}

export class DenominationStatusBodyDto {
  @ApiProperty()
  @IsBoolean({ message: 'Indica si la denominación queda activa o inactiva.' })
  isActive!: boolean;
}

export class DenominationSummaryDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ description: 'ISO 8601 en UTC.' }) createdAt!: string;
  @ApiProperty() legalEntityCount!: number;
  @ApiProperty() congregationCount!: number;
}

export class DenominationPageDto extends PageResponseDto {
  @ApiProperty({ type: [DenominationSummaryDto] })
  items!: DenominationSummaryDto[];
}

export class DenominationStatsDto {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty({ description: 'Sedes de todas las denominaciones.' })
  congregations!: number;
}
