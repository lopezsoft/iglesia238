import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page.js';
import {
  CARD_STATUSES,
  CERTIFICATE_STATUSES,
  type CardStatus,
  type CertificateStatus,
} from '../application/certificate.models.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = 'La fecha debe tener el formato AAAA-MM-DD.';
const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

// ---- Bodies ----

export class PreviewCertificateDto {
  @ApiProperty({ description: 'Miembro activo de la sede.', example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  memberId!: number;

  @ApiProperty({
    description: 'Tipo de certificado de la denominación.',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  certificateTypeId!: number;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'Las observaciones admiten máximo 255 caracteres.',
  })
  notes?: string | null;
}

export class IssueCertificateDto extends PreviewCertificateDto {}

export class VoidDto {
  @ApiProperty({
    description: 'Motivo de la anulación (entre 10 y 255 caracteres).',
    minLength: 10,
    maxLength: 255,
  })
  @IsString()
  @MaxLength(1000, { message: 'El motivo es demasiado largo.' })
  reason!: string;
}

export class IssueCardDto {
  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  memberId!: number;

  @ApiProperty({
    example: '2026-11-02',
    description: 'Fecha de emisión (no futura).',
  })
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  issuedOn!: string;

  @ApiProperty({
    example: '2028-11-02',
    description: 'Vencimiento: posterior a la emisión y no pasado.',
  })
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  expiresOn!: string;
}

// ---- Queries ----

export class ScopeCongregationQueryDto {
  @ApiPropertyOptional({
    description:
      'Solo en alcance de denominación: limita el resultado a una sede.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  congregationId?: number;
}

export class CertificateFilterQueryDto extends ScopeCongregationQueryDto {
  @ApiPropertyOptional({
    description: 'Código del tipo: MEM, TRA, BAU, ASI...',
  })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  typeCode?: string;

  @ApiPropertyOptional({ enum: CERTIFICATE_STATUSES })
  @IsOptional()
  @IsIn(CERTIFICATE_STATUSES)
  status?: CertificateStatus;

  @ApiPropertyOptional({
    description:
      'Número del documento (CERT-MEM-2026-0031) o nombre del miembro.',
  })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  memberId?: number;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  issuedFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  issuedTo?: string;

  @ApiPropertyOptional({
    enum: ['issuedOn:desc', 'issuedOn:asc'],
    default: 'issuedOn:desc',
  })
  @IsOptional()
  @IsIn(['issuedOn:desc', 'issuedOn:asc'])
  sort: 'issuedOn:desc' | 'issuedOn:asc' = 'issuedOn:desc';
}

export class ListCertificatesQueryDto extends IntersectionType(
  PageQueryDto,
  CertificateFilterQueryDto,
) {}

export class MemberSearchQueryDto {
  @ApiProperty({
    description: 'Nombre, código de miembro o documento (mínimo 2 caracteres).',
  })
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 16, default: 8 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(16)
  limit?: number;
}

export class CardFilterQueryDto extends ScopeCongregationQueryDto {
  @ApiPropertyOptional({ enum: CARD_STATUSES })
  @IsOptional()
  @IsIn(CARD_STATUSES)
  status?: CardStatus;

  @ApiPropertyOptional({
    description: 'Nombre del miembro o código del carné (SC-0130).',
  })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    description: 'Solo carnés vigentes que vencen en los próximos N días.',
    minimum: 1,
    maximum: 365,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiringInDays?: number;
}

export class ListCardsQueryDto extends IntersectionType(
  PageQueryDto,
  CardFilterQueryDto,
) {}

export class CardCandidatesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: 'Nombre del miembro o código (SC-0130).',
  })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
