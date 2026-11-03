import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { NormalizedText } from '../../../common/validation/text-transforms.js';
import type {
  PolicyListView,
  PolicyView,
} from '../application/privacy-policies.use-cases.js';
import type { PolicyState, PolicyStatus } from '../domain/current-policy.js';

export class PrivacyPolicyInputDto {
  @ApiProperty({
    example: '2.0',
    maxLength: 20,
    description: 'Versión, única en la denominación.',
  })
  @NormalizedText()
  @IsString({ message: 'Escribe la versión de la política.' })
  @MaxLength(60)
  version!: string;

  @ApiProperty({
    description: 'Texto completo que lee y acepta el solicitante.',
  })
  @IsString({ message: 'Escribe el texto de la política.' })
  @MaxLength(60000)
  content!: string;

  @ApiProperty({
    example: '2026-12-01',
    description:
      'Fecha desde la que rige (AAAA-MM-DD). Al publicar, una fecha pasada se mueve a hoy.',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de vigencia debe tener el formato AAAA-MM-DD.',
  })
  effectiveFrom!: string;
}

export class PrivacyPolicyDto implements PolicyView {
  @ApiProperty() id!: number;
  @ApiProperty() version!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ example: '2026-12-01' }) effectiveFrom!: string;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED'] }) status!: PolicyStatus;
  @ApiProperty({ enum: ['DRAFT', 'CURRENT', 'SCHEDULED', 'SUPERSEDED'] })
  state!: PolicyState;
  @ApiProperty({
    description: 'Es la política que aceptan hoy los solicitantes.',
  })
  isCurrent!: boolean;
  @ApiProperty({ nullable: true, type: String }) publishedAt!: string | null;
  @ApiProperty({
    description: 'Autorizaciones de datos otorgadas con esta política.',
  })
  consentCount!: number;
  @ApiProperty({ description: 'Solicitudes que aceptaron esta política.' })
  applicationCount!: number;
}

export class PrivacyPolicyListDto implements PolicyListView {
  @ApiProperty({ type: [PrivacyPolicyDto] }) items!: PrivacyPolicyDto[];
  @ApiProperty({
    description:
      'Falso cuando no hay ninguna política vigente: el formulario público no recibe solicitudes de la denominación.',
  })
  hasCurrentPolicy!: boolean;
}
