import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PageQueryDto,
  PageResponseDto,
} from '../../../common/pagination/page.js';
import { NormalizedText } from '../../../common/validation/text-transforms.js';
import type {
  ApplicationDetailView,
  ApplicationFormDataView,
  ApplicationQueueView,
  ApplicationSummaryView,
  ApprovalResultView,
  PersonMatchView,
} from '../application/application-views.js';
import {
  APPLICATION_FILTERS,
  APPLICATION_STATUSES,
  type ApplicationCounts,
  type ApplicationFilter,
  type ApplicationStatus,
} from '../domain/application-status.js';

const toOptionalInt = ({ value }: { value: unknown }): unknown =>
  value === undefined || value === '' ? undefined : Number(value);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ListApplicationsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: APPLICATION_FILTERS,
    default: 'PENDING',
    description:
      '"PENDING" agrupa las solicitudes pendientes y las que están en revisión.',
  })
  @IsOptional()
  @IsIn(APPLICATION_FILTERS)
  filter: ApplicationFilter = 'PENDING';

  @ApiPropertyOptional({
    description: 'Palabras del nombre o del documento.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    description: 'Solo en alcance de denominación: limita a una sede.',
  })
  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  congregationId?: number;

  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Recibidas desde este día (YYYY-MM-DD).',
  })
  @IsOptional()
  @Matches(ISO_DAY, {
    message: 'La fecha inicial debe tener el formato AAAA-MM-DD.',
  })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-30',
    description: 'Recibidas hasta este día, inclusive (YYYY-MM-DD).',
  })
  @IsOptional()
  @Matches(ISO_DAY, {
    message: 'La fecha final debe tener el formato AAAA-MM-DD.',
  })
  to?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}

export class RejectApplicationDto {
  @ApiProperty({
    description:
      'Motivo interno del rechazo (10 a 255 caracteres). El solicitante no lo ve: solo sabe que no fue aprobada.',
    maxLength: 255,
  })
  @NormalizedText()
  @IsString({ message: 'Escribe el motivo del rechazo.' })
  @MaxLength(2000)
  reason!: string;
}

export class MarkDuplicateDto {
  @ApiProperty({
    description: 'Persona de la denominación que ya tiene el mismo documento.',
  })
  @IsInt({ message: 'Indica la persona con la que coincide.' })
  @Min(1)
  matchedPersonId!: number;
}

export class ApproveApplicationDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Persona ya registrada con el mismo documento (un familiar, un acudiente, un miembro que regresa). Sin este dato, un documento repetido bloquea la aprobación.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  linkToPersonId?: number | null;
}

export class PersonMatchDto implements PersonMatchView {
  @ApiProperty() personId!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty({ nullable: true, type: String }) documentTypeCode!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) documentNumber!: string | null;
  @ApiProperty({ nullable: true, type: String }) congregationName!:
    string | null;
  @ApiProperty({ nullable: true, type: Number }) memberId!: number | null;
  @ApiProperty({ nullable: true, type: String, example: 'SC-0153' })
  memberCode!: string | null;
  @ApiProperty({
    nullable: true,
    enum: ['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED'],
  })
  memberStatus!: PersonMatchView['memberStatus'];
}

export class ApplicationSummaryDto implements ApplicationSummaryView {
  @ApiProperty() id!: number;
  @ApiProperty() congregationId!: number;
  @ApiProperty() congregationName!: string;
  @ApiProperty({ enum: APPLICATION_STATUSES }) status!: ApplicationStatus;
  @ApiProperty() fullName!: string;
  @ApiProperty({ nullable: true, type: String }) documentTypeCode!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) documentNumber!: string | null;
  @ApiProperty({ description: 'ISO 8601.' }) createdAt!: string;
  @ApiProperty() isMinor!: boolean;
  @ApiProperty() hasDuplicateMatch!: boolean;
}

export class ApplicationCountsDto implements ApplicationCounts {
  @ApiProperty() PENDING!: number;
  @ApiProperty() DUPLICATE!: number;
  @ApiProperty() APPROVED!: number;
  @ApiProperty() REJECTED!: number;
  @ApiProperty() ALL!: number;
}

export class ApplicationQueueDto
  extends PageResponseDto
  implements ApplicationQueueView
{
  @ApiProperty({ type: [ApplicationSummaryDto] })
  items!: ApplicationSummaryDto[];
  @ApiProperty({ type: ApplicationCountsDto }) counts!: ApplicationCountsDto;
}

export class ApplicationFormDataDto implements ApplicationFormDataView {
  @ApiProperty({ nullable: true, type: String }) secondLastName!: string | null;
  @ApiProperty({ enum: ['FEMALE', 'MALE'] }) sex!: 'FEMALE' | 'MALE';
  @ApiProperty() maritalStatusCode!: string;
  @ApiProperty({ nullable: true, type: String }) maritalStatusName!:
    string | null;
  @ApiProperty() address!: string;
  @ApiProperty({
    description: 'Código del municipio (en Colombia, el código DIVIPOLA).',
  })
  municipalityCode!: string;
  @ApiProperty({ nullable: true, type: String }) municipalityName!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) regionName!: string | null;
  @ApiProperty({ nullable: true, type: String }) neighborhood!: string | null;
  @ApiProperty({ nullable: true, type: String }) occupation!: string | null;
  @ApiProperty({ nullable: true, type: String }) previousCongregationName!:
    string | null;
  @ApiProperty({ nullable: true, type: Boolean }) isBaptized!: boolean | null;
  @ApiProperty({ nullable: true, type: String }) guardianRelationship!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) guardianPhone!: string | null;
  @ApiProperty({ nullable: true, type: String }) guardianDocumentTypeCode!:
    string | null;
}

export class ApplicationDetailDto implements ApplicationDetailView {
  @ApiProperty() id!: number;
  @ApiProperty() congregationId!: number;
  @ApiProperty() congregationName!: string;
  @ApiProperty({ enum: APPLICATION_STATUSES }) status!: ApplicationStatus;
  @ApiProperty({ nullable: true, type: String }) documentTypeCode!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) documentTypeName!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) documentNumber!: string | null;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String, example: '1990-05-20' })
  birthDate!: string | null;
  @ApiProperty({ nullable: true, type: Number }) age!: number | null;
  @ApiProperty() isMinor!: boolean;
  @ApiProperty({ nullable: true, type: String }) guardianName!: string | null;
  @ApiProperty({ nullable: true, type: String }) guardianDocument!:
    string | null;
  @ApiProperty({ type: ApplicationFormDataDto })
  formData!: ApplicationFormDataDto;
  @ApiProperty({ nullable: true, type: String }) policyVersion!: string | null;
  @ApiProperty() consentedAt!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true, type: String }) reviewerName!: string | null;
  @ApiProperty({ nullable: true, type: String }) reviewedAt!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Motivo interno; el solicitante no lo ve.',
  })
  rejectionReason!: string | null;
  @ApiProperty({ nullable: true, type: PersonMatchDto })
  duplicateMatch!: PersonMatchDto | null;
  @ApiProperty({ nullable: true, type: PersonMatchDto })
  linkedPerson!: PersonMatchDto | null;
  @ApiProperty({ nullable: true, type: Number }) memberId!: number | null;
  @ApiProperty({ nullable: true, type: String, example: 'SC-0153' })
  memberCode!: string | null;
}

export class ApprovalResultDto implements ApprovalResultView {
  @ApiProperty() applicationId!: number;
  @ApiProperty() memberId!: number;
  @ApiProperty() memberNumber!: number;
  @ApiProperty({ example: 'SC-0153' }) memberCode!: string;
}
