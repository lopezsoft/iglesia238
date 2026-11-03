import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../../common/security/password-policy.js';
import {
  NormalizedEmail,
  NormalizedOptionalText,
  NormalizedText,
} from '../../../common/validation/text-transforms.js';

const EMAIL_MAX_LENGTH = 191;
const PHONE = /^[0-9+\s()-]{7,30}$/;

export class PublicLegalEntityDto {
  @ApiProperty() id!: number;
  @ApiProperty() legalName!: string;
  @ApiProperty({ nullable: true, type: String }) tradeName!: string | null;
  @ApiProperty({
    example: '***.***.**6-7',
    description: 'NIT enmascarado: solo se ven los últimos 3 caracteres.',
  })
  taxIdMasked!: string;
  @ApiProperty() denominationId!: number;
  @ApiProperty() denominationName!: string;
  @ApiProperty({ description: 'País de la razón social y de sus sedes.' })
  countryId!: number;
  @ApiProperty({ example: 'Colombia' }) countryName!: string;
}

export class RegistrationCongregationDto {
  @ApiProperty({ maxLength: 150, example: 'Sede Norte' })
  @NormalizedText()
  @IsString({ message: 'Escribe el nombre de la sede.' })
  @IsNotEmpty({ message: 'Escribe el nombre de la sede.' })
  @MaxLength(150, {
    message: 'El nombre de la sede admite máximo 150 caracteres.',
  })
  name!: string;

  @ApiProperty({
    description:
      'Código del municipio, del país de la razón social (GET /public/geo/municipalities?countryId=). En Colombia, el código DIVIPOLA.',
    example: '13001',
  })
  @NormalizedText()
  @IsString({ message: 'Selecciona el municipio de la sede.' })
  @Matches(/^\d{1,10}$/, { message: 'Selecciona el municipio de la sede.' })
  municipalityCode!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @NormalizedOptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'La dirección admite máximo 200 caracteres.' })
  address?: string | null;

  @ApiPropertyOptional({ maxLength: 30 })
  @NormalizedOptionalText()
  @IsOptional()
  @Matches(PHONE, { message: 'Escribe un teléfono válido.' })
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: EMAIL_MAX_LENGTH })
  @NormalizedOptionalText()
  @IsOptional()
  @IsEmail({}, { message: 'Escribe un correo válido para la sede.' })
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string | null;
}

export class RegistrationManagerDto {
  @ApiProperty({ minLength: 3, maxLength: 150, example: 'Laura Gómez' })
  @NormalizedText()
  @IsString({ message: 'Escribe tu nombre completo.' })
  @MinLength(3, { message: 'Escribe tu nombre completo.' })
  @MaxLength(150, { message: 'Tu nombre admite máximo 150 caracteres.' })
  displayName!: string;

  @ApiProperty({ example: 'laura@iglesia.org', maxLength: EMAIL_MAX_LENGTH })
  @NormalizedEmail()
  @IsEmail({}, { message: 'Escribe un correo válido.' })
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty({
    maxLength: MAX_PASSWORD_LENGTH,
    description:
      'Mínimo 10 caracteres, con letras y números, sin tu correo ni tu nombre.',
  })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

export class RegisterCongregationDto {
  @ApiProperty({
    description: 'Razón social elegida (GET /public/legal-entities).',
    example: 12,
  })
  @IsInt({ message: 'Elige la razón social.' })
  @Min(1, { message: 'Elige la razón social.' })
  legalEntityId!: number;

  @ApiProperty({ type: RegistrationCongregationDto })
  @IsObject({ message: 'Indica los datos de la sede.' })
  @ValidateNested()
  @Type(() => RegistrationCongregationDto)
  congregation!: RegistrationCongregationDto;

  @ApiProperty({ type: RegistrationManagerDto })
  @IsObject({ message: 'Indica tus datos de acceso.' })
  @ValidateNested()
  @Type(() => RegistrationManagerDto)
  manager!: RegistrationManagerDto;
}

export class CongregationRegistrationReceiptDto {
  @ApiProperty({ example: true })
  emailVerificationRequired!: true;

  @ApiProperty({ example: 'Sede Norte' })
  congregationName!: string;

  @ApiPropertyOptional({
    description:
      'Enlace de confirmación. Solo en desarrollo (NODE_ENV distinto de production) y sin SMTP configurado; nunca en producción.',
  })
  devVerificationLink?: string;
}
