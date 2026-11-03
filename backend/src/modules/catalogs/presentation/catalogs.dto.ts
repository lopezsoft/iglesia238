import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_MUNICIPALITY_LIMIT,
  MAX_NEIGHBORHOOD_LENGTH,
  MAX_SEARCH_LENGTH,
} from '../application/catalogs.use-cases.js';

export class CatalogEntryDto {
  @ApiProperty({ example: 'CC' }) code!: string;
  @ApiProperty({ example: 'Cédula de ciudadanía' }) name!: string;
}

export class PublicCatalogsResponseDto {
  @ApiProperty({ type: [CatalogEntryDto] }) documentTypes!: CatalogEntryDto[];
  @ApiProperty({ type: [CatalogEntryDto] }) maritalStatuses!: CatalogEntryDto[];
}

export class CatalogsResponseDto extends PublicCatalogsResponseDto {
  @ApiProperty({ type: [CatalogEntryDto] }) educationLevels!: CatalogEntryDto[];
  @ApiProperty({ type: [CatalogEntryDto] }) studyTypes!: CatalogEntryDto[];
  @ApiProperty({ type: [CatalogEntryDto] }) meetingTypes!: CatalogEntryDto[];
  @ApiProperty({ type: [CatalogEntryDto] })
  attendanceCategories!: CatalogEntryDto[];
}

export class MunicipalityDto {
  @ApiProperty({ example: '05001', description: 'Código DIVIPOLA del DANE.' })
  code!: string;
  @ApiProperty({ example: 'Medellín' }) name!: string;
  @ApiProperty({ example: '05' }) regionCode!: string;
  @ApiProperty({ example: 'Antioquia' }) regionName!: string;
}

export class NeighborhoodDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'Laureles' }) name!: string;
}

export class EnsuredNeighborhoodDto extends NeighborhoodDto {
  @ApiProperty({ description: 'Verdadero si el barrio no existía y se creó.' })
  created!: boolean;
}

const toOptionalInt = ({ value }: { value: unknown }): unknown =>
  value === undefined || value === '' ? undefined : Number(value);

export class SearchQueryDto {
  @ApiPropertyOptional({
    description: 'Texto a buscar (sin distinguir mayúsculas ni tildes).',
    maxLength: MAX_SEARCH_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_MUNICIPALITY_LIMIT,
    default: 20,
  })
  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MUNICIPALITY_LIMIT)
  limit?: number;
}

export class CreateNeighborhoodDto {
  @ApiProperty({ example: 'Laureles', maxLength: MAX_NEIGHBORHOOD_LENGTH })
  @IsString()
  @MaxLength(MAX_NEIGHBORHOOD_LENGTH + 40, {
    message: 'El nombre del barrio es demasiado largo.',
  })
  name!: string;
}
