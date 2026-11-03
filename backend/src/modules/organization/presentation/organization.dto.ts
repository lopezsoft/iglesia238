import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  NormalizedOptionalText,
  NormalizedText,
} from '../../../common/validation/text-transforms.js';
import { FIELD_LIMITS } from '../application/organization-rules.js';

export class CongregationBodyDto {
  @ApiProperty({ maxLength: FIELD_LIMITS.congregationName })
  @NormalizedText()
  @IsString({ message: 'El nombre de la sede es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre de la sede es obligatorio.' })
  @MaxLength(FIELD_LIMITS.congregationName, {
    message: `El nombre admite máximo ${FIELD_LIMITS.congregationName} caracteres.`,
  })
  name!: string;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: FIELD_LIMITS.congregationCode,
    description:
      'Abreviatura estable de la sede. Si se omite al crear, se genera a partir del nombre.',
  })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.congregationCode, {
    message: `El código admite máximo ${FIELD_LIMITS.congregationCode} caracteres.`,
  })
  code?: string | null;

  @ApiProperty()
  @IsInt({ message: 'Selecciona la razón social.' })
  @Min(1, { message: 'Selecciona la razón social.' })
  legalEntityId!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt({ message: 'El distrito no es válido.' })
  @Min(1, { message: 'El distrito no es válido.' })
  districtId?: number | null;

  @ApiProperty({
    description: 'Código DIVIPOLA del municipio.',
    example: '13001',
  })
  @IsString({ message: 'Selecciona un municipio válido.' })
  @Matches(/^\d{1,10}$/, { message: 'Selecciona un municipio válido.' })
  municipalityCode!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: FIELD_LIMITS.neighborhood })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.neighborhood, {
    message: `El barrio admite máximo ${FIELD_LIMITS.neighborhood} caracteres.`,
  })
  neighborhood?: string | null;

  @ApiProperty({ maxLength: FIELD_LIMITS.address })
  @NormalizedText()
  @IsString({ message: 'La dirección es obligatoria.' })
  @IsNotEmpty({ message: 'La dirección es obligatoria.' })
  @MaxLength(FIELD_LIMITS.address, {
    message: `La dirección admite máximo ${FIELD_LIMITS.address} caracteres.`,
  })
  address!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: FIELD_LIMITS.phone })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.phone, {
    message: `El teléfono admite máximo ${FIELD_LIMITS.phone} caracteres.`,
  })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: FIELD_LIMITS.email })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.email, {
    message: `El correo admite máximo ${FIELD_LIMITS.email} caracteres.`,
  })
  email?: string | null;

  @ApiProperty()
  @IsBoolean({ message: 'Indica si la sede recibe inscripciones.' })
  acceptsApplications!: boolean;
}

export class StatusBodyDto {
  @ApiProperty()
  @IsBoolean({ message: 'Indica si el registro queda activo o inactivo.' })
  isActive!: boolean;
}

export class AcceptsApplicationsBodyDto {
  @ApiProperty()
  @IsBoolean({ message: 'Indica si la sede recibe inscripciones.' })
  acceptsApplications!: boolean;
}

export class LegalEntityBodyDto {
  @ApiProperty({ maxLength: FIELD_LIMITS.legalName })
  @NormalizedText()
  @IsString({ message: 'La razón social es obligatoria.' })
  @IsNotEmpty({ message: 'La razón social es obligatoria.' })
  @MaxLength(FIELD_LIMITS.legalName, {
    message: `La razón social admite máximo ${FIELD_LIMITS.legalName} caracteres.`,
  })
  legalName!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: FIELD_LIMITS.legalName })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.legalName)
  tradeName?: string | null;

  @ApiProperty({ example: '900.123.456-7', maxLength: FIELD_LIMITS.taxId })
  @IsString({ message: 'El NIT es obligatorio.' })
  @IsNotEmpty({ message: 'El NIT es obligatorio.' })
  @MaxLength(FIELD_LIMITS.taxId, {
    message: `El NIT admite máximo ${FIELD_LIMITS.taxId} caracteres.`,
  })
  taxId!: string;

  @ApiProperty({ maxLength: FIELD_LIMITS.legalName })
  @NormalizedText()
  @IsString({ message: 'El representante legal es obligatorio.' })
  @IsNotEmpty({ message: 'El representante legal es obligatorio.' })
  @MaxLength(FIELD_LIMITS.legalName)
  legalRepresentative!: string;

  @ApiProperty({
    description: 'Código DIVIPOLA del municipio.',
    example: '13001',
  })
  @IsString({ message: 'Selecciona un municipio válido.' })
  @Matches(/^\d{1,10}$/, { message: 'Selecciona un municipio válido.' })
  municipalityCode!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: FIELD_LIMITS.email })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.email)
  email?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: FIELD_LIMITS.phone })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.phone)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: FIELD_LIMITS.address })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.address)
  address?: string | null;
}

export class DistrictBodyDto {
  @ApiProperty({ maxLength: FIELD_LIMITS.districtNumber })
  @NormalizedText()
  @IsString({ message: 'El número del distrito es obligatorio.' })
  @IsNotEmpty({ message: 'El número del distrito es obligatorio.' })
  @MaxLength(FIELD_LIMITS.districtNumber, {
    message: `El número admite máximo ${FIELD_LIMITS.districtNumber} caracteres.`,
  })
  number!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: FIELD_LIMITS.districtName })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.districtName, {
    message: `El nombre admite máximo ${FIELD_LIMITS.districtName} caracteres.`,
  })
  name?: string | null;
}

// ---- Responses (Swagger documentation) ----

export class CongregationDto {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty() legalEntityId!: number;
  @ApiProperty() legalEntityName!: string;
  @ApiProperty({ nullable: true }) districtId!: number | null;
  @ApiProperty({ nullable: true }) districtNumber!: string | null;
  @ApiProperty({ example: 'MSC' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) municipalityCode!: string | null;
  @ApiProperty({ nullable: true }) municipalityName!: string | null;
  @ApiProperty({ nullable: true }) regionName!: string | null;
  @ApiProperty({ nullable: true }) neighborhood!: string | null;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty() acceptsApplications!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
}

export class LegalEntityDto {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty() legalName!: string;
  @ApiProperty({ nullable: true }) tradeName!: string | null;
  @ApiProperty() taxId!: string;
  @ApiProperty({ nullable: true }) legalRepresentative!: string | null;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty({ nullable: true }) municipalityCode!: string | null;
  @ApiProperty({ nullable: true }) municipalityName!: string | null;
  @ApiProperty({ nullable: true }) regionName!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
}

export class DistrictDto {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty() number!: string;
  @ApiProperty({ nullable: true }) name!: string | null;
  @ApiProperty({ type: [String] }) congregationNames!: string[];
}

export class OrganizationOverviewDto {
  @ApiProperty() denominationName!: string;
  @ApiProperty() activeCongregations!: number;
  @ApiProperty() totalCongregations!: number;
  @ApiProperty() acceptingApplications!: number;
  @ApiProperty() legalEntities!: number;
  @ApiProperty() districts!: number;
}

export class SelectOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() label!: string;
  @ApiProperty() isActive!: boolean;
}

export class CongregationFormOptionsDto {
  @ApiProperty({ type: [SelectOptionDto] }) legalEntities!: SelectOptionDto[];
  @ApiProperty({ type: [SelectOptionDto] }) districts!: SelectOptionDto[];
}
