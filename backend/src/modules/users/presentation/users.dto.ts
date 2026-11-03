import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import {
  PageQueryDto,
  PageResponseDto,
} from '../../../common/pagination/page.js';
import {
  NormalizedEmail,
  NormalizedText,
} from '../../../common/validation/text-transforms.js';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  EMAIL_MAX_LENGTH,
} from '../application/invitations.use-cases.js';
import { ROLE_SCOPE_KIND } from '../application/role-policy.js';

const ROLE_CODES = Object.keys(ROLE_SCOPE_KIND);
const USER_STATUSES = ['ACTIVE', 'INVITATION_PENDING', 'INACTIVE'] as const;
const ROLE_MESSAGE = 'El rol no es válido.';

export class ListUsersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: 'Texto contenido en el nombre o el correo.',
  })
  @NormalizedText()
  @IsOptional()
  @IsString()
  @MaxLength(191)
  search: string = '';

  @ApiPropertyOptional({
    enum: ROLE_CODES,
    description: 'Solo usuarios con este rol vigente.',
  })
  @IsOptional()
  @IsIn(ROLE_CODES, { message: ROLE_MESSAGE })
  role?: string;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES, { message: 'El estado no es válido.' })
  status?: (typeof USER_STATUSES)[number];
}

export class GrantRoleBodyDto {
  @ApiProperty({ enum: ROLE_CODES })
  @IsIn(ROLE_CODES, { message: ROLE_MESSAGE })
  role!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Obligatoria para DENOMINATION_ADMIN cuando actúa la plataforma.',
  })
  @IsOptional()
  @IsInt({ message: 'La denominación no es válida.' })
  @Min(1, { message: 'La denominación no es válida.' })
  denominationId?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Obligatoria para PASTOR, SECRETARY y TREASURER.',
  })
  @IsOptional()
  @IsInt({ message: 'La sede no es válida.' })
  @Min(1, { message: 'La sede no es válida.' })
  congregationId?: number | null;
}

export class InviteUserBodyDto extends GrantRoleBodyDto {
  @ApiProperty({
    minLength: DISPLAY_NAME_MIN_LENGTH,
    maxLength: DISPLAY_NAME_MAX_LENGTH,
  })
  @NormalizedText()
  @IsString({ message: 'Escribe el nombre completo de la persona.' })
  @MinLength(DISPLAY_NAME_MIN_LENGTH, {
    message: 'Escribe el nombre completo de la persona.',
  })
  @MaxLength(DISPLAY_NAME_MAX_LENGTH, {
    message: `El nombre admite máximo ${DISPLAY_NAME_MAX_LENGTH} caracteres.`,
  })
  displayName!: string;

  @ApiProperty({ maxLength: EMAIL_MAX_LENGTH })
  @NormalizedEmail()
  @IsString({ message: 'Escribe un correo electrónico válido.' })
  @IsNotEmpty({ message: 'Escribe un correo electrónico válido.' })
  @MaxLength(EMAIL_MAX_LENGTH, {
    message: `El correo admite máximo ${EMAIL_MAX_LENGTH} caracteres.`,
  })
  email!: string;
}

// ---- Responses (Swagger documentation) ----

export class AssignmentDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ROLE_CODES }) role!: string;
  @ApiProperty({ enum: ['PLATFORM', 'DENOMINATION', 'CONGREGATION'] })
  scope!: string;
  @ApiProperty({ nullable: true }) denominationId!: number | null;
  @ApiProperty({ nullable: true }) congregationId!: number | null;
  @ApiProperty() scopeLabel!: string;
  @ApiProperty({ nullable: true }) grantedByName!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true }) revokedAt!: string | null;
}

export class ManagedUserDto {
  @ApiProperty() id!: number;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: USER_STATUSES }) status!: string;
  @ApiProperty({ nullable: true }) lastLoginAt!: string | null;
  @ApiProperty() isSelf!: boolean;
  @ApiProperty({ type: [AssignmentDto] }) assignments!: AssignmentDto[];
}

export class ManagedUserPageDto extends PageResponseDto {
  @ApiProperty({ type: [ManagedUserDto] }) items!: ManagedUserDto[];
}

export class ScopeOptionDto {
  @ApiProperty({ enum: ['PLATFORM', 'DENOMINATION', 'CONGREGATION'] })
  kind!: string;
  @ApiProperty({ nullable: true }) denominationId!: number | null;
  @ApiProperty({ nullable: true }) congregationId!: number | null;
  @ApiProperty() label!: string;
}

export class GrantableRoleDto {
  @ApiProperty() role!: string;
  @ApiProperty({ type: [ScopeOptionDto] }) scopes!: ScopeOptionDto[];
}

export class GrantContextDto {
  @ApiProperty() isPlatformAdmin!: boolean;
  @ApiProperty() audienceLabel!: string;
  @ApiProperty({ type: [GrantableRoleDto] }) roles!: GrantableRoleDto[];
}

export class OneTimeLinkDto {
  @ApiProperty({
    description:
      'Enlace de un solo uso. Solo se entrega a quien lo pidió: no se guarda ni se registra.',
  })
  link!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ enum: ['INVITATION', 'PASSWORD_RESET'] }) purpose!: string;
  @ApiProperty({
    description: 'Verdadero si el correo se entregó al servidor de correo.',
  })
  emailDelivered!: boolean;
}

export class InvitationResultDto {
  @ApiProperty({ type: ManagedUserDto }) user!: ManagedUserDto;
  @ApiProperty({ type: OneTimeLinkDto })
  invitation!: OneTimeLinkDto;
}

export class RoleMatrixRowDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({
    enum: ['PLATFORM', 'DENOMINATION', 'CONGREGATION'],
    nullable: true,
  })
  scopeKind!: string | null;
  @ApiProperty({ type: [String] }) permissions!: string[];
}

export class PermissionDto {
  @ApiProperty() code!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
}

export class RoleMatrixDto {
  @ApiProperty({ type: [RoleMatrixRowDto] }) roles!: RoleMatrixRowDto[];
  @ApiProperty({ type: [PermissionDto] }) permissions!: PermissionDto[];
}
