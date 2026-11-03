import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../../common/security/password-policy.js';

const MAX_EMAIL_LENGTH = 254;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,200}$/;

export class LoginRequestDto {
  @ApiProperty({ example: 'pastor@iglesia.org', maxLength: MAX_EMAIL_LENGTH })
  @IsEmail({}, { message: 'Escribe un correo válido.' })
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @ApiProperty({ maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @MinLength(1, { message: 'Escribe tu contraseña.' })
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

export class PasswordResetRequestDto {
  @ApiProperty({ example: 'pastor@iglesia.org' })
  @IsEmail({}, { message: 'Escribe un correo válido.' })
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty({ description: 'Token del enlace de recuperación.' })
  @IsString()
  @Matches(TOKEN_PATTERN, { message: 'El enlace no es válido.' })
  token!: string;

  @ApiProperty({ maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword!: string;
}

export class InvitationLookupDto {
  @ApiProperty({ description: 'Token del enlace de invitación.' })
  @IsString()
  @MaxLength(300)
  token!: string;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'Token del enlace de invitación.' })
  @IsString()
  @Matches(TOKEN_PATTERN, { message: 'El enlace no es válido.' })
  token!: string;

  @ApiProperty({ maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

export class EmailVerificationConfirmDto {
  @ApiProperty({ description: 'Token del enlace de confirmación del correo.' })
  @IsString()
  @Matches(TOKEN_PATTERN, { message: 'El enlace no es válido.' })
  token!: string;
}

export class EmailVerificationResendResponseDto {
  @ApiPropertyOptional({
    description:
      'Enlace de confirmación. Solo en desarrollo (NODE_ENV distinto de production) y sin SMTP configurado; nunca en producción.',
  })
  devVerificationLink?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @MinLength(1, { message: 'Escribe tu contraseña actual.' })
  @MaxLength(MAX_PASSWORD_LENGTH)
  currentPassword!: string;

  @ApiProperty({ maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword!: string;
}

export class ScopeDto {
  @ApiProperty({ enum: ['PLATFORM', 'DENOMINATION', 'CONGREGATION'] })
  kind!: 'PLATFORM' | 'DENOMINATION' | 'CONGREGATION';

  @ApiProperty({ nullable: true, type: Number })
  denominationId!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  congregationId!: number | null;

  @ApiProperty({ example: 'Toda la denominación · Iglesia Ejemplo' })
  label!: string;
}

export class AssignmentDto {
  @ApiProperty({ example: 'DENOMINATION_ADMIN' })
  role!: string;

  @ApiProperty({ example: 'Administrador de denominación' })
  roleName!: string;

  @ApiProperty({ type: [String], example: ['members.read'] })
  permissions!: string[];

  @ApiProperty({ type: ScopeDto })
  scope!: ScopeDto;
}

export class SessionResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;

  @ApiProperty({
    description:
      'Falso hasta que la persona confirma su correo: las rutas de dominio responden 403 EMAIL_NOT_VERIFIED y solo funcionan /auth/*.',
  })
  emailVerified!: boolean;

  @ApiProperty({
    type: [AssignmentDto],
    description: 'Solo roles vigentes, con los permisos que otorgan.',
  })
  assignments!: AssignmentDto[];

  @ApiProperty({
    type: [ScopeDto],
    description:
      'Alcances donde puede actuar: el de cada rol y, para roles de denominación, cada sede activa.',
  })
  selectableScopes!: ScopeDto[];
}

export class TokenResponseDto {
  @ApiProperty({
    description: 'JWT de corta duración. Guardarlo solo en memoria.',
  })
  accessToken!: string;

  @ApiProperty({ description: 'Segundos hasta que vence el access token.' })
  expiresIn!: number;

  @ApiProperty({ type: SessionResponseDto })
  session!: SessionResponseDto;
}

export class InvitationResponseDto {
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;

  @ApiPropertyOptional({ description: 'ISO 8601: cuándo vence el enlace.' })
  expiresAt!: string;
}
