import { ApiProperty } from '@nestjs/swagger';

// Response shapes of the membership API. The use cases already return plain objects with exactly
// these fields; the classes exist to document them in Swagger.

const STATUSES = ['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED'];
const NULLABLE_STRING = { type: String, nullable: true } as const;
const NULLABLE_NUMBER = { type: Number, nullable: true } as const;

export class MemberListItemDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'SC-0130' }) code!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ enum: ['FEMALE', 'MALE'], nullable: true }) sex!:
    string | null;
  @ApiProperty(NULLABLE_STRING) documentTypeCode!: string | null;
  @ApiProperty(NULLABLE_STRING) documentNumber!: string | null;
  @ApiProperty(NULLABLE_NUMBER) age!: number | null;
  @ApiProperty(NULLABLE_STRING) phone!: string | null;
  @ApiProperty({ ...NULLABLE_STRING, example: '2008-04-10' }) joinedOn!:
    string | null;
  @ApiProperty({ enum: STATUSES }) status!: string;
  @ApiProperty() congregationId!: number;
  @ApiProperty() congregationName!: string;
  @ApiProperty({ type: [String], description: 'Cargos vigentes.' })
  positions!: string[];
}

export class StatusCountsDto {
  @ApiProperty() ALL!: number;
  @ApiProperty() ACTIVE!: number;
  @ApiProperty() INACTIVE!: number;
  @ApiProperty() TRANSFERRED!: number;
  @ApiProperty() DECEASED!: number;
}

export class MemberListPageDto {
  @ApiProperty({ type: [MemberListItemDto] }) items!: MemberListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({
    type: StatusCountsDto,
    description:
      'Miembros por estado con todos los filtros aplicados salvo el estado.',
  })
  statusCounts!: StatusCountsDto;
}

export class PersonDetailDto {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty(NULLABLE_NUMBER) userId!: number | null;
  @ApiProperty(NULLABLE_STRING) documentTypeCode!: string | null;
  @ApiProperty(NULLABLE_STRING) documentNumber!: string | null;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty(NULLABLE_STRING) secondLastName!: string | null;
  @ApiProperty({ enum: ['FEMALE', 'MALE'], nullable: true }) sex!:
    string | null;
  @ApiProperty(NULLABLE_STRING) birthDate!: string | null;
  @ApiProperty(NULLABLE_STRING) maritalStatusCode!: string | null;
  @ApiProperty(NULLABLE_STRING) educationLevelCode!: string | null;
  @ApiProperty(NULLABLE_STRING) profession!: string | null;
  @ApiProperty(NULLABLE_STRING) occupation!: string | null;
  @ApiProperty(NULLABLE_STRING) phone!: string | null;
  @ApiProperty(NULLABLE_STRING) email!: string | null;
  @ApiProperty(NULLABLE_STRING) address!: string | null;
  @ApiProperty(NULLABLE_STRING) municipalityCode!: string | null;
  @ApiProperty(NULLABLE_STRING) documentIssuePlaceCode?: string | null;
  @ApiProperty(NULLABLE_STRING) birthPlaceCode?: string | null;
  @ApiProperty(NULLABLE_STRING) workplace?: string | null;
  @ApiProperty(NULLABLE_NUMBER) childrenCount?: number | null;
  @ApiProperty(NULLABLE_STRING) landlinePhone?: string | null;
  @ApiProperty(NULLABLE_STRING) workPhone?: string | null;
  @ApiProperty(NULLABLE_STRING) neighborhood?: string | null;
}

export class MemberDetailDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'SC-0130' }) code!: string;
  @ApiProperty({ enum: STATUSES }) status!: string;
  @ApiProperty(NULLABLE_STRING) joinedOn!: string | null;
  @ApiProperty(NULLABLE_STRING) convertedOn?: string | null;
  @ApiProperty({ type: Boolean, nullable: true }) isBaptized!: boolean | null;
  @ApiProperty(NULLABLE_STRING) waterBaptismOn!: string | null;
  @ApiProperty(NULLABLE_STRING) baptismMunicipalityCode?: string | null;
  @ApiProperty(NULLABLE_STRING) baptismPlace!: string | null;
  @ApiProperty(NULLABLE_STRING) baptizingPastorName?: string | null;
  @ApiProperty(NULLABLE_STRING) holySpiritBaptismOn?: string | null;
  @ApiProperty(NULLABLE_STRING) reconciledOn?: string | null;
  @ApiProperty(NULLABLE_NUMBER) previousCongregationId?: number | null;
  @ApiProperty(NULLABLE_STRING) previousCongregationName!: string | null;
  @ApiProperty({ type: Boolean, required: false })
  isChristianEducationTeacher?: boolean;
  @ApiProperty(NULLABLE_STRING) desiredAreas?: string | null;
  @ApiProperty(NULLABLE_STRING) pastorNotes?: string | null;
  @ApiProperty() congregationId!: number;
  @ApiProperty() congregationName!: string;
  @ApiProperty(NULLABLE_STRING) congregationMunicipalityCode!: string | null;
  @ApiProperty({ type: PersonDetailDto }) person!: PersonDetailDto;
}

export class FamilyRelationViewDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ['FATHER', 'MOTHER', 'CHILD', 'GUARDIAN'] })
  type!: string;
  @ApiProperty() relativeId!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty(NULLABLE_STRING) documentTypeCode!: string | null;
  @ApiProperty({ ...NULLABLE_STRING, example: 'CC ···· 4817' })
  maskedDocument!: string | null;
  @ApiProperty(NULLABLE_NUMBER) age!: number | null;
  @ApiProperty({
    ...NULLABLE_NUMBER,
    description:
      'Solo si el familiar es un miembro que el usuario puede abrir.',
  })
  memberId!: number | null;
  @ApiProperty(NULLABLE_STRING) memberCode!: string | null;
  @ApiProperty(NULLABLE_STRING) congregationName!: string | null;
  @ApiProperty({ enum: STATUSES, nullable: true }) memberStatus!: string | null;
}

export class PersonStudyViewDto {
  @ApiProperty() id!: number;
  @ApiProperty() studyTypeCode!: string;
  @ApiProperty() name!: string;
  @ApiProperty(NULLABLE_STRING) institution!: string | null;
  @ApiProperty({ enum: ['IN_PROGRESS', 'COMPLETED'] }) status!: string;
  @ApiProperty(NULLABLE_NUMBER) year!: number | null;
}

export class CatalogItemDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
}

export class MemberPositionRowDto {
  @ApiProperty() id!: number;
  @ApiProperty() memberId!: number;
  @ApiProperty() positionId!: number;
  @ApiProperty() positionName!: string;
  @ApiProperty(NULLABLE_STRING) startedOn!: string | null;
  @ApiProperty(NULLABLE_STRING) endedOn!: string | null;
}

export class MemberPositionsViewDto {
  @ApiProperty(NULLABLE_NUMBER) pastoralRankId!: number | null;
  @ApiProperty(NULLABLE_STRING) pastoralRankName!: string | null;
  @ApiProperty({ type: [MemberPositionRowDto] })
  positions!: MemberPositionRowDto[];
  @ApiProperty({ type: [CatalogItemDto] }) positionCatalog!: CatalogItemDto[];
  @ApiProperty({ type: [CatalogItemDto] }) rankCatalog!: CatalogItemDto[];
}

export class SocioeconomicProfileViewDto {
  @ApiProperty() personId!: number;
  @ApiProperty({ type: Boolean, nullable: true }) hasHealthCoverage!:
    boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) hasPension!: boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) hasOccupationalRiskCoverage!:
    boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) isSubsidizedRegime!:
    boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) hasFamilyCompensation!:
    boolean | null;
  @ApiProperty(NULLABLE_NUMBER) sisbenLevel!: number | null;
  @ApiProperty({ type: Boolean, nullable: true }) isDisplaced!: boolean | null;
  @ApiProperty() updatedAt!: string;
}

export class RegistryEntryViewDto {
  @ApiProperty() id!: number;
  @ApiProperty() congregationId!: number;
  @ApiProperty() congregationName!: string;
  @ApiProperty() memberNumber!: number;
  @ApiProperty({ example: 'SC-0130' }) code!: string;
  @ApiProperty(NULLABLE_STRING) registryBook!: string | null;
  @ApiProperty(NULLABLE_STRING) registryFolio!: string | null;
  @ApiProperty() startedOn!: string;
  @ApiProperty(NULLABLE_STRING) endedOn!: string | null;
}

export class TransferViewDto {
  @ApiProperty() id!: number;
  @ApiProperty() originName!: string;
  @ApiProperty() destinationName!: string;
  @ApiProperty() isExternal!: boolean;
  @ApiProperty({
    enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'],
  })
  status!: string;
  @ApiProperty() transferDate!: string;
  @ApiProperty(NULLABLE_STRING) notes!: string | null;
}

export class StatusHistoryViewDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: STATUSES }) status!: string;
  @ApiProperty() startedOn!: string;
  @ApiProperty(NULLABLE_STRING) reason!: string | null;
  @ApiProperty(NULLABLE_STRING) changedBy!: string | null;
}

export class MemberRegistryViewDto {
  @ApiProperty({ type: [RegistryEntryViewDto] })
  entries!: RegistryEntryViewDto[];
  @ApiProperty({ type: [TransferViewDto] }) transfers!: TransferViewDto[];
  @ApiProperty({ type: [StatusHistoryViewDto] })
  statusHistory!: StatusHistoryViewDto[];
}

export class CongregationOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty(NULLABLE_STRING) municipalityCode!: string | null;
}

export class TransferResultDto {
  @ApiProperty({ enum: ['INTERNAL', 'EXTERNAL'] }) kind!: string;
  @ApiProperty() destinationName!: string;
  @ApiProperty({
    description:
      'Falso si el miembro salió de la sede en la que actúa el usuario.',
  })
  stillVisible!: boolean;
}

export class ConsentViewDto {
  @ApiProperty() id!: number;
  @ApiProperty() policyVersion!: string;
  @ApiProperty(NULLABLE_STRING) policyEffectiveFrom!: string | null;
  @ApiProperty({ enum: ['WEB_FORM', 'PAPER'] }) channel!: string;
  @ApiProperty() grantedAt!: string;
  @ApiProperty(NULLABLE_STRING) revokedAt!: string | null;
  @ApiProperty(NULLABLE_STRING) guardianName!: string | null;
}

export class PersonOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty(NULLABLE_STRING) documentTypeCode!: string | null;
  @ApiProperty({ ...NULLABLE_STRING, example: 'CC ···· 4817' })
  maskedDocument!: string | null;
  @ApiProperty(NULLABLE_STRING) memberCode!: string | null;
  @ApiProperty(NULLABLE_STRING) congregationName!: string | null;
}
