import { ApiProperty } from '@nestjs/swagger';
import { PageResponseDto } from '../../../common/pagination/page.js';

export class NamedOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
}

export class PersonSummaryDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'Marta Castillo Rojas' }) fullName!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    example: 'SC-0130',
    description: 'Código de miembro en su sede.',
  })
  memberCode!: string | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Sede actual del miembro.',
  })
  congregationId!: number | null;
  @ApiProperty({ nullable: true, enum: ['FEMALE', 'MALE'] }) sex!:
    'FEMALE' | 'MALE' | null;
  @ApiProperty({ nullable: true, type: String, example: '2019-03-14' })
  birthDate!: string | null;
  @ApiProperty({ nullable: true, type: Number }) age!: number | null;
  @ApiProperty({
    nullable: true,
    type: String,
    example: 'TI ···· 4817',
    description: 'El documento nunca sale completo.',
  })
  maskedDocument!: string | null;
}

export class PersonOptionDto extends PersonSummaryDto {
  @ApiProperty({
    description: 'Tiene un matrimonio vigente: no puede ser cónyuge de otro.',
  })
  hasActiveMarriage!: boolean;
}

export class ParentReferenceDto {
  @ApiProperty({ nullable: true, type: Number }) personId!: number | null;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) memberCode!: string | null;
}

export class ChildDedicationDto {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty() congregationId!: number;
  @ApiProperty() congregationName!: string;
  @ApiProperty({ example: '2026-10-25' }) dedicatedOn!: string;
  @ApiProperty({ type: PersonSummaryDto }) child!: PersonSummaryDto;
  @ApiProperty({ type: PersonSummaryDto, nullable: true })
  pastor!: PersonSummaryDto | null;
  @ApiProperty({ type: ParentReferenceDto, nullable: true })
  father!: ParentReferenceDto | null;
  @ApiProperty({ type: ParentReferenceDto, nullable: true })
  mother!: ParentReferenceDto | null;
  @ApiProperty({ type: ParentReferenceDto, nullable: true })
  guardian!: ParentReferenceDto | null;
}

export class ChildDedicationPageDto extends PageResponseDto {
  @ApiProperty({ type: [ChildDedicationDto] }) items!: ChildDedicationDto[];
}

export class MarriageDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'MAT-0007' }) code!: string;
  @ApiProperty() denominationId!: number;
  @ApiProperty({ type: PersonSummaryDto }) spouse1!: PersonSummaryDto;
  @ApiProperty({ type: PersonSummaryDto }) spouse2!: PersonSummaryDto;
  @ApiProperty({ nullable: true, enum: ['NOTARY', 'CHURCH'] }) registeredWith!:
    'NOTARY' | 'CHURCH' | null;
  @ApiProperty({ nullable: true, type: String, example: '2026-07-18' })
  marriedOn!: string | null;
  @ApiProperty({ nullable: true, type: String }) place!: string | null;
  @ApiProperty({ type: PersonSummaryDto, nullable: true })
  officiant!: PersonSummaryDto | null;
  @ApiProperty({ nullable: true, type: String }) endedOn!: string | null;
  @ApiProperty({ nullable: true, enum: ['DIVORCE', 'DEATH', 'ANNULMENT'] })
  endReason!: 'DIVORCE' | 'DEATH' | 'ANNULMENT' | null;
  @ApiProperty({ enum: ['ACTIVE', 'DISSOLVED'] }) status!:
    'ACTIVE' | 'DISSOLVED';
}

export class MarriagePageDto extends PageResponseDto {
  @ApiProperty({ type: [MarriageDto] }) items!: MarriageDto[];
}

export class PastoralTermDto {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty() congregationId!: number;
  @ApiProperty() congregationName!: string;
  @ApiProperty({ type: PersonSummaryDto }) pastor!: PersonSummaryDto;
  @ApiProperty({ example: '2021-02-01' }) startedOn!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Vacío mientras el periodo está abierto.',
  })
  endedOn!: string | null;
}

export class RecordsContextDto {
  @ApiProperty({ example: '2026-11-02', description: 'Hoy en Bogotá.' })
  today!: string;
  @ApiProperty({ type: [NamedOptionDto] }) congregations!: NamedOptionDto[];
}

export class CurrentPastorDto {
  @ApiProperty() congregationId!: number;
  @ApiProperty() congregationName!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() startedOn!: string;
}

export class RecordsSummaryDto {
  @ApiProperty() year!: number;
  @ApiProperty() dedicationsThisYear!: number;
  @ApiProperty() dedicationsTotal!: number;
  @ApiProperty() marriagesActive!: number;
  @ApiProperty() marriagesDissolved!: number;
  @ApiProperty() termsTotal!: number;
  @ApiProperty({
    type: CurrentPastorDto,
    nullable: true,
    description: 'Solo cuando el alcance es una sede.',
  })
  currentPastor!: CurrentPastorDto | null;
  @ApiProperty() congregationsWithPastor!: number;
  @ApiProperty() congregationsTotal!: number;
}
