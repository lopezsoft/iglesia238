import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { LegalEntityBodyDto, LegalEntityDto } from './organization.dto.js';

export class PlatformLegalEntityCreateDto extends LegalEntityBodyDto {
  @ApiProperty({
    description: 'Denominación (iglesia) a la que pertenece la razón social.',
    example: 1,
  })
  @IsInt({ message: 'Elige la denominación.' })
  @Min(1, { message: 'Elige la denominación.' })
  denominationId!: number;
}

/** Every field is optional: only what is sent changes. The denomination of a legal entity does not change. */
export class PlatformLegalEntityUpdateDto extends PartialType(
  LegalEntityBodyDto,
) {}

export class PlatformLegalEntitiesQueryDto {
  @ApiPropertyOptional({
    description: 'Solo las razones sociales de esa denominación.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'La denominación no es válida.' })
  @Min(1, { message: 'La denominación no es válida.' })
  denominationId?: number;
}

export class PlatformLegalEntityDto extends LegalEntityDto {
  @ApiProperty() denominationName!: string;
  @ApiProperty({
    description: 'Sedes de la razón social que no están eliminadas.',
  })
  congregationCount!: number;
}
