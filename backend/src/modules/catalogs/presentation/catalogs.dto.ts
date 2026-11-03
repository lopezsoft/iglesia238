import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
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

export class CountryDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'CO', description: 'ISO 3166-1 alfa-2.' })
  isoAlpha2!: string;
  @ApiProperty({ example: 'Colombia' }) name!: string;
  @ApiProperty({
    description: 'Solo los países activos se ofrecen en el sistema.',
  })
  isActive!: boolean;
  @ApiProperty({
    description:
      'Tiene municipios cargados: solo entonces se puede elegir municipio (y crear sedes).',
  })
  hasMunicipalities!: boolean;
}

export class PlatformCountryDto extends CountryDto {
  @ApiProperty({ example: 'COL', nullable: true, type: String })
  isoAlpha3!: string | null;
  @ApiProperty({ description: 'Departamentos o estados cargados.' })
  regionCount!: number;
  @ApiProperty({ description: 'Municipios cargados.' })
  municipalityCount!: number;
}

export class CountryStatusBodyDto {
  @ApiProperty()
  @IsBoolean({ message: 'Indica si el país queda activo o inactivo.' })
  isActive!: boolean;
}

export class MunicipalityDto {
  @ApiProperty({ description: 'País del municipio.' })
  countryId!: number;
  @ApiProperty({
    example: '05001',
    description:
      'Código oficial, único dentro de su departamento (en Colombia, el código DIVIPOLA del DANE).',
  })
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

const toOptionalBoolean = ({ value }: { value: unknown }): unknown =>
  value === undefined || value === ''
    ? undefined
    : value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value;

export class CountriesQueryDto {
  @ApiPropertyOptional({
    description:
      'Incluir los países inactivos. Solo para el equipo de plataforma (X-Scope: P y denominations.manage).',
    default: false,
  })
  @Transform(toOptionalBoolean)
  @IsOptional()
  @IsBoolean({ message: 'includeInactive debe ser true o false.' })
  includeInactive?: boolean;
}

/** Country of a municipality code. Without it, the default country (DEFAULT_COUNTRY_ISO). */
export class CountryQueryDto {
  @ApiPropertyOptional({
    description:
      'País del municipio (GET /geo/countries). Los códigos se repiten entre países.',
  })
  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt({ message: 'El país no es válido.' })
  @Min(1, { message: 'El país no es válido.' })
  countryId?: number;
}

export class MunicipalitySearchQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({
    description:
      'Solo los municipios de ese país (GET /geo/countries). Sin él, los de todos los países activos.',
  })
  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt({ message: 'El país no es válido.' })
  @Min(1, { message: 'El país no es válido.' })
  countryId?: number;
}

export class CreateNeighborhoodDto {
  @ApiProperty({ example: 'Laureles', maxLength: MAX_NEIGHBORHOOD_LENGTH })
  @IsString()
  @MaxLength(MAX_NEIGHBORHOOD_LENGTH + 40, {
    message: 'El nombre del barrio es demasiado largo.',
  })
  name!: string;
}
