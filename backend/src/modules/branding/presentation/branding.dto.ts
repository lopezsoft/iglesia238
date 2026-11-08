import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import type { BrandingView } from '../application/branding.models.js';

export class UploadLogoDto {
  @ApiProperty({
    description:
      'Contenido del archivo PNG o JPEG en base64, sin el prefijo «data:image/...;base64,». Máximo 512 KB ya decodificado.',
  })
  // The size is checked by the use case (with a clear message) before the text is decoded.
  @IsString()
  contentBase64!: string;
}

export class UpdateBrandColorDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: '#1F56C4',
    description:
      'Color institucional #RRGGBB, con contraste suficiente sobre blanco. Vacío o null vuelve al color por defecto.',
  })
  @IsOptional()
  @IsString()
  primaryColor?: string | null;
}

class BrandingLimitsDto {
  @ApiProperty({ example: 524_288 }) logoMaxBytes!: number;
  @ApiProperty({ example: 32 }) logoMinDimension!: number;
  @ApiProperty({ example: 2000 }) logoMaxDimension!: number;
  @ApiProperty({ example: 4.5 }) minContrast!: number;
}

export class BrandingDto implements BrandingView {
  @ApiProperty() denominationName!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    example: 'branding/1/logo-3f9a1c0b5d7e2a46.png',
    description: 'La URL del logo es /api/public/<logoKey>.',
  })
  logoKey!: string | null;
  @ApiProperty({ nullable: true, type: String, example: '#1f56c4' })
  primaryColor!: string | null;
  @ApiProperty({ example: '#1f56c4' }) defaultColor!: string;
  @ApiProperty({ type: BrandingLimitsDto }) limits!: BrandingLimitsDto;
}
