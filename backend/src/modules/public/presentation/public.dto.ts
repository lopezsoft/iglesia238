import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  NormalizedOptionalText,
  NormalizedText,
} from '../../../common/validation/text-transforms.js';
import { GUARDIAN_RELATIONSHIPS } from '../domain/public-status.js';
import type {
  CurrentPolicyRecord,
  OpenCongregationRecord,
} from '../application/ports/public-directory.reader.js';
import type { SubmitApplicationInput } from '../application/submit-application.use-case.js';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^[0-9+\s-]{7,20}$/;
const DOCUMENT = /^[A-Za-z0-9]{3,20}$/;
const DOCUMENT_MESSAGE =
  'El documento debe tener entre 3 y 20 letras o números, sin puntos ni espacios.';

export class GuardianDto {
  @ApiProperty({ maxLength: 80 })
  @NormalizedText()
  @IsString()
  @IsNotEmpty({ message: 'Escribe los nombres del acudiente.' })
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ maxLength: 80 })
  @NormalizedText()
  @IsString()
  @IsNotEmpty({ message: 'Escribe los apellidos del acudiente.' })
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({
    example: 'CC',
    description: 'Código del tipo de documento (GET /public/catalogs).',
  })
  @IsString()
  @MaxLength(10)
  documentTypeCode!: string;

  @ApiProperty({ example: '52345678' })
  @Matches(DOCUMENT, { message: DOCUMENT_MESSAGE })
  documentNumber!: string;

  @ApiProperty({ enum: GUARDIAN_RELATIONSHIPS })
  @IsIn(GUARDIAN_RELATIONSHIPS, {
    message: 'Selecciona el parentesco del acudiente.',
  })
  relationship!: string;

  @ApiProperty({ example: '3001234567' })
  @Matches(PHONE, {
    message: 'Escribe un teléfono válido para el acudiente (7 a 20 dígitos).',
  })
  phone!: string;
}

export class SubmitApplicationDto implements SubmitApplicationInput {
  @ApiProperty({ description: 'Sede elegida (GET /public/congregations).' })
  @IsInt({ message: 'Selecciona una sede.' })
  @Min(1)
  congregationId!: number;

  @ApiProperty({
    description: 'Política vigente que el solicitante leyó y aceptó.',
  })
  @IsInt()
  @Min(1)
  policyId!: number;

  @ApiProperty({ maxLength: 80 })
  @NormalizedText()
  @IsString()
  @IsNotEmpty({ message: 'Escribe tus nombres.' })
  @MaxLength(80, { message: 'Los nombres admiten máximo 80 caracteres.' })
  firstName!: string;

  @ApiProperty({ maxLength: 80, description: 'Primer apellido.' })
  @NormalizedText()
  @IsString()
  @IsNotEmpty({ message: 'Escribe tu primer apellido.' })
  @MaxLength(80, { message: 'El apellido admite máximo 80 caracteres.' })
  lastName!: string;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, type: String })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(80, {
    message: 'El segundo apellido admite máximo 80 caracteres.',
  })
  secondLastName: string | null = null;

  @ApiProperty({ example: 'CC' })
  @IsString()
  @MaxLength(10)
  documentTypeCode!: string;

  @ApiProperty({
    example: '1023456789',
    description: 'Sin puntos, guiones ni espacios.',
  })
  @Matches(DOCUMENT, { message: DOCUMENT_MESSAGE })
  documentNumber!: string;

  @ApiProperty({ example: '1990-05-20', description: 'AAAA-MM-DD.' })
  @Matches(ISO_DAY, {
    message: 'La fecha de nacimiento debe tener el formato AAAA-MM-DD.',
  })
  birthDate!: string;

  @ApiProperty({ enum: ['FEMALE', 'MALE'] })
  @IsIn(['FEMALE', 'MALE'], { message: 'Selecciona el sexo.' })
  sex!: 'FEMALE' | 'MALE';

  @ApiProperty({ example: 'SINGLE' })
  @IsString()
  @MaxLength(20)
  maritalStatusCode!: string;

  @ApiProperty({ example: '3001234567' })
  @Matches(PHONE, { message: 'Escribe un teléfono válido (7 a 20 dígitos).' })
  phone!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @NormalizedOptionalText()
  @IsOptional()
  @IsEmail({}, { message: 'Escribe un correo electrónico válido.' })
  @MaxLength(191)
  email: string | null = null;

  @ApiProperty({ maxLength: 120 })
  @NormalizedText()
  @IsString()
  @IsNotEmpty({ message: 'Escribe tu dirección.' })
  @MaxLength(120, { message: 'La dirección admite máximo 120 caracteres.' })
  address!: string;

  @ApiProperty({
    example: '13001',
    description: 'Código DIVIPOLA del municipio.',
  })
  @Matches(/^\d{1,10}$/, { message: 'Selecciona tu municipio.' })
  municipalityCode!: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, type: String })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood: string | null = null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, type: String })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  occupation: string | null = null;

  @ApiPropertyOptional({ maxLength: 150, nullable: true, type: String })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  previousCongregationName: string | null = null;

  @ApiPropertyOptional({
    nullable: true,
    type: Boolean,
    description: 'Null: no lo sabe o no lo dice.',
  })
  @IsOptional()
  @IsBoolean()
  isBaptized: boolean | null = null;

  @ApiPropertyOptional({
    type: GuardianDto,
    nullable: true,
    description:
      'Obligatorio si el solicitante es menor de 18 años; se ignora si es mayor.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuardianDto)
  guardian: GuardianDto | null = null;

  @ApiProperty({
    description:
      'Debe ser verdadero: aceptación de la política de datos (Ley 1581 de 2012).',
  })
  @IsBoolean()
  consentAccepted!: boolean;

  @ApiPropertyOptional({
    description: 'Trampa para bots: déjalo vacío.',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website: string | null = null;
}

export class TrackingStatusRequestDto {
  @ApiProperty({ example: 'IG-7F3K-92QD' })
  @IsString()
  @MaxLength(30)
  trackingCode!: string;
}

export class SubmissionReceiptDto {
  @ApiProperty({
    example: 'IG-7F3K-92QD',
    description: 'Se muestra una sola vez; solo se guarda su huella.',
  })
  trackingCode!: string;
}

export class PublicStatusDto {
  @ApiProperty({ enum: ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'] })
  status!: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
  @ApiProperty() statusLabel!: string;
  @ApiProperty({ description: 'ISO 8601.' }) submittedOn!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Solo cuando ya se decidió.',
  })
  reviewedOn!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Aviso genérico de un rechazo; nunca el motivo.',
  })
  notice!: string | null;
}

export class OpenCongregationDto implements OpenCongregationRecord {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty() denominationName!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) municipalityCode!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) municipalityName!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) regionName!: string | null;
  @ApiProperty({ nullable: true, type: String }) neighborhood!: string | null;
  @ApiProperty({ nullable: true, type: String }) address!: string | null;
}

export class CurrentPolicyDto implements CurrentPolicyRecord {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty() version!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ example: '2026-11-02' }) effectiveFrom!: string;
}
