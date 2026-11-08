import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength } from 'class-validator';
import type {
  CertificateTypeChanges,
  CertificateTypeTemplateView,
  TemplateCatalogView,
  TemplatePlaceholderView,
  TemplatePreviewView,
} from '../application/certificate.models.js';

/** Defensive cap of the transport; the friendly, per-field limits are checked by the use case. */
const TRANSPORT_LIMIT = 5000;

export class UpdateCertificateTypeDto implements CertificateTypeChanges {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSPORT_LIMIT)
  name?: string;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Días de vigencia; null si el certificado no vence.',
  })
  @IsOptional()
  @IsInt()
  @Max(100_000)
  validityDays?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    maxLength: 2000,
    description:
      'Cuerpo con marcadores {{memberName}}…; vacío o null usa el texto por defecto.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSPORT_LIMIT)
  template?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSPORT_LIMIT)
  introTemplate?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSPORT_LIMIT)
  closingTemplate?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSPORT_LIMIT)
  pastorTitleTemplate?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSPORT_LIMIT)
  secretaryTitleTemplate?: string | null;
}

export class CertificateTypeTemplateDto implements CertificateTypeTemplateView {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'MEM' }) code!: string;
  @ApiProperty({ example: 'Certificado de membresía' }) name!: string;
  @ApiProperty({ nullable: true, type: Number }) validityDays!: number | null;
  @ApiProperty({ nullable: true, type: String }) template!: string | null;
  @ApiProperty({ nullable: true, type: String }) introTemplate!: string | null;
  @ApiProperty({ nullable: true, type: String }) closingTemplate!:
    string | null;
  @ApiProperty({ nullable: true, type: String })
  pastorTitleTemplate!: string | null;
  @ApiProperty({ nullable: true, type: String })
  secretaryTitleTemplate!: string | null;
}

class TemplatePlaceholderDto implements TemplatePlaceholderView {
  @ApiProperty({ example: 'memberName' }) key!: string;
  @ApiProperty() description!: string;
}

class TemplateDefaultsDto {
  @ApiProperty() intro!: string;
  @ApiProperty() closing!: string;
  @ApiProperty() pastorTitle!: string;
  @ApiProperty() secretaryTitle!: string;
}

export class TemplateCatalogDto implements TemplateCatalogView {
  @ApiProperty({ type: [CertificateTypeTemplateDto] })
  types!: CertificateTypeTemplateDto[];
  @ApiProperty({ type: [TemplatePlaceholderDto] })
  placeholders!: TemplatePlaceholderDto[];
  @ApiProperty({ type: TemplateDefaultsDto }) defaults!: TemplateDefaultsDto;
}

export class TemplatePreviewDto implements TemplatePreviewView {
  @ApiProperty() title!: string;
  @ApiProperty() intro!: string;
  @ApiProperty() body!: string;
  @ApiProperty() closing!: string;
  @ApiProperty() pastorName!: string;
  @ApiProperty() pastorTitle!: string;
  @ApiProperty() secretaryName!: string;
  @ApiProperty() secretaryTitle!: string;
}
