import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  OneOf,
  OptionalBoolean,
  OptionalDate,
  OptionalInt,
  OptionalOneOf,
  OptionalText,
  QueryOneOf,
  RequiredBoolean,
  RequiredDate,
  RequiredInt,
  RequiredText,
} from './validators.js';

const SEXES = ['FEMALE', 'MALE'] as const;
const STATUSES = ['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED'] as const;
const AGE_RANGES = [
  'ALL',
  'CHILDREN',
  'TEENAGERS',
  'YOUNG_ADULTS',
  'ADULTS',
  'SENIORS',
] as const;
const RELATION_TYPES = ['FATHER', 'MOTHER', 'CHILD', 'GUARDIAN'] as const;

// ---------- Lists ----------

export class MemberFiltersQueryDto {
  @OptionalText('La búsqueda', 100)
  text?: string;

  @QueryOneOf('El estado', ['ALL', ...STATUSES])
  status: 'ALL' | (typeof STATUSES)[number] = 'ALL';

  @QueryOneOf('El sexo', ['ALL', ...SEXES])
  sex: 'ALL' | (typeof SEXES)[number] = 'ALL';

  @QueryOneOf('El rango de edad', AGE_RANGES)
  ageRange: (typeof AGE_RANGES)[number] = 'ALL';

  @ApiPropertyOptional({
    description: 'ALL, NONE (sin cargo vigente) o el id de un cargo.',
    example: 'ALL',
  })
  @IsOptional()
  @Matches(/^(ALL|NONE|\d{1,10})$/, { message: 'El cargo no es válido.' })
  position: string = 'ALL';

  @ApiPropertyOptional({
    description: 'Limita una consulta de toda la denominación a una sede.',
  })
  @OptionalInt('La sede')
  congregationId?: number;
}

export class ListMembersQueryDto extends MemberFiltersQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @OptionalInt('La página')
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @OptionalInt('El tamaño de página', 1, 100)
  pageSize: number = 25;

  @QueryOneOf('El orden', ['name', 'joinedOn', 'age'])
  sortBy: 'name' | 'joinedOn' | 'age' = 'name';

  @QueryOneOf('El sentido del orden', ['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';
}

export class PeopleSearchQueryDto {
  @ApiProperty({
    description: 'Nombre, documento o código de miembro (mínimo 2 caracteres).',
  })
  @RequiredText('La búsqueda', 100, 1)
  q!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 8 })
  @OptionalInt('El límite', 1, 50)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Sede, para quien actúa en toda la denominación.',
  })
  @OptionalInt('La sede')
  congregationId?: number;
}

export class CongregationQueryDto {
  @ApiPropertyOptional({
    description: 'Sede, para quien actúa en toda la denominación.',
  })
  @OptionalInt('La sede')
  congregationId?: number;
}

// ---------- Person ----------

export class PersonDataDto {
  @RequiredText('Los nombres', 100)
  firstName!: string;

  @RequiredText('El primer apellido', 80)
  lastName!: string;

  @OptionalText('El segundo apellido', 80)
  secondLastName?: string | null;

  @OptionalText('El tipo de documento', 10)
  documentTypeCode?: string | null;

  @OptionalText('El número de documento', 30)
  documentNumber?: string | null;

  @OptionalText('El lugar de expedición del documento', 10)
  documentIssuePlaceCode?: string | null;

  @OptionalDate('La fecha de nacimiento')
  birthDate?: string | null;

  @OptionalText('El lugar de nacimiento', 10)
  birthPlaceCode?: string | null;

  @OptionalOneOf('El sexo', SEXES)
  sex?: (typeof SEXES)[number] | null;

  @OptionalText('El estado civil', 20)
  maritalStatusCode?: string | null;

  @OptionalText('El nivel educativo', 20)
  educationLevelCode?: string | null;

  @OptionalText('La profesión', 120)
  profession?: string | null;

  @OptionalText('La ocupación', 120)
  occupation?: string | null;

  @OptionalText('El lugar de trabajo', 150)
  workplace?: string | null;

  @OptionalInt('El número de hijos', 0, 30)
  childrenCount?: number | null;

  @OptionalText('El teléfono', 30)
  phone?: string | null;

  @OptionalText('El teléfono fijo', 30)
  landlinePhone?: string | null;

  @OptionalText('El teléfono del trabajo', 30)
  workPhone?: string | null;

  @OptionalText('El correo electrónico', 191)
  email?: string | null;

  @OptionalText('La dirección', 200)
  address?: string | null;

  @OptionalText('El municipio', 10)
  municipalityCode?: string | null;

  @OptionalText('El barrio', 100)
  neighborhood?: string | null;
}

export class CreateMemberDto {
  @ApiPropertyOptional({
    description:
      'Obligatoria para quien actúa en toda la denominación; fija para quien actúa en una sede.',
  })
  @OptionalInt('La sede')
  congregationId?: number | null;

  @ApiPropertyOptional({
    description:
      'Registra como miembro a una persona que ya existe (no es miembro todavía).',
  })
  @OptionalInt('La persona')
  existingPersonId?: number | null;

  @ApiPropertyOptional({
    type: PersonDataDto,
    description: 'Obligatorio sin existingPersonId.',
  })
  @ValidateIf((dto: CreateMemberDto) => dto.existingPersonId == null)
  @IsDefined({ message: 'Completa los datos de la persona.' })
  @ValidateNested()
  @Type(() => PersonDataDto)
  person?: PersonDataDto;

  @OptionalDate('La fecha de ingreso')
  joinedOn?: string | null;

  @OptionalDate('La fecha de conversión')
  convertedOn?: string | null;

  @OptionalBoolean('El bautismo en agua')
  isBaptized?: boolean | null;

  @OptionalDate('La fecha del bautismo')
  waterBaptismOn?: string | null;

  @OptionalText('El municipio del bautismo', 10)
  baptismMunicipalityCode?: string | null;

  @OptionalText('El lugar del bautismo', 150)
  baptismPlace?: string | null;

  @OptionalText('El pastor que bautizó', 150)
  baptizingPastorName?: string | null;

  @OptionalDate('La fecha de recepción del Espíritu Santo')
  holySpiritBaptismOn?: string | null;

  @OptionalDate('La fecha de reconciliación')
  reconciledOn?: string | null;

  @OptionalInt('La sede anterior')
  previousCongregationId?: number | null;

  @OptionalText('La iglesia anterior', 150)
  previousCongregationName?: string | null;

  @OptionalBoolean('Maestro de educación cristiana')
  isChristianEducationTeacher?: boolean;

  @OptionalText('Los campos en los que le gustaría desempeñarse', 255)
  desiredAreas?: string | null;

  @OptionalText('Las observaciones del pastor', 2000)
  pastorNotes?: string | null;

  @OptionalText('El libro del registro', 20)
  registryBook?: string | null;

  @OptionalText('El folio del registro', 20)
  registryFolio?: string | null;

  @ApiPropertyOptional({
    description: 'Acudiente de un menor de edad (persona existente).',
  })
  @OptionalInt('El acudiente')
  guardianPersonId?: number | null;

  @RequiredBoolean('La autorización de tratamiento de datos')
  consentAccepted!: boolean;
}

export class UpdateMembershipDto {
  @OptionalDate('La fecha de ingreso')
  joinedOn?: string | null;

  @OptionalDate('La fecha de conversión')
  convertedOn?: string | null;

  @OptionalBoolean('El bautismo en agua')
  isBaptized?: boolean | null;

  @OptionalDate('La fecha del bautismo')
  waterBaptismOn?: string | null;

  @OptionalText('El municipio del bautismo', 10)
  baptismMunicipalityCode?: string | null;

  @OptionalText('El lugar del bautismo', 150)
  baptismPlace?: string | null;

  @OptionalText('El pastor que bautizó', 150)
  baptizingPastorName?: string | null;

  @OptionalDate('La fecha de recepción del Espíritu Santo')
  holySpiritBaptismOn?: string | null;

  @OptionalDate('La fecha de reconciliación')
  reconciledOn?: string | null;

  @OptionalInt('La sede anterior')
  previousCongregationId?: number | null;

  @OptionalText('La iglesia anterior', 150)
  previousCongregationName?: string | null;

  @OptionalBoolean('Maestro de educación cristiana')
  isChristianEducationTeacher?: boolean;

  @OptionalText('Los campos en los que le gustaría desempeñarse', 255)
  desiredAreas?: string | null;

  @OptionalText('Las observaciones del pastor', 2000)
  pastorNotes?: string | null;
}

export class ChangeStatusDto {
  @OneOf('El estado', STATUSES)
  status!: (typeof STATUSES)[number];

  @OptionalText('El motivo', 255)
  reason?: string | null;

  @OptionalDate('La fecha del cambio')
  effectiveOn?: string | null;
}

// ---------- Family, studies, positions ----------

export class FamilyRelationDto {
  @RequiredInt('El familiar')
  relativeId!: number;

  @OneOf('El parentesco', RELATION_TYPES)
  type!: (typeof RELATION_TYPES)[number];
}

export class PersonStudyDto {
  @RequiredText('El tipo de estudio', 30)
  studyTypeCode!: string;

  @RequiredText('El programa o título', 150, 3)
  name!: string;

  @OptionalText('La institución', 150)
  institution?: string | null;

  @OneOf('El estado del estudio', ['IN_PROGRESS', 'COMPLETED'])
  status!: 'IN_PROGRESS' | 'COMPLETED';

  @OptionalInt('El año', 1900, 2200)
  year?: number | null;
}

export class AssignPositionDto {
  @RequiredInt('El cargo')
  positionId!: number;

  @RequiredDate('La fecha de inicio')
  startedOn!: string;
}

export class ClosePositionDto {
  @RequiredDate('La fecha de cierre')
  endedOn!: string;
}

export class PastoralRankDto {
  @OptionalInt('El grado pastoral')
  pastoralRankId?: number | null;
}

// ---------- Sensitive data ----------

export class SocioeconomicProfileDto {
  @OptionalBoolean('La afiliación a salud')
  hasHealthCoverage?: boolean | null;

  @OptionalBoolean('La afiliación a pensión')
  hasPension?: boolean | null;

  @OptionalBoolean('La afiliación a riesgos laborales')
  hasOccupationalRiskCoverage?: boolean | null;

  @OptionalBoolean('El régimen subsidiado')
  isSubsidizedRegime?: boolean | null;

  @OptionalBoolean('La caja de compensación')
  hasFamilyCompensation?: boolean | null;

  @OptionalInt('El nivel del SISBÉN', 1, 6)
  sisbenLevel?: number | null;

  @OptionalBoolean('La población desplazada')
  isDisplaced?: boolean | null;
}

export class TransferDto {
  @OneOf('El tipo de traslado', ['INTERNAL', 'EXTERNAL'])
  kind!: 'INTERNAL' | 'EXTERNAL';

  @ApiPropertyOptional({ description: 'Obligatoria en un traslado interno.' })
  @ValidateIf((dto: TransferDto) => dto.kind === 'INTERNAL')
  @RequiredInt('La sede destino')
  destinationCongregationId?: number;

  @ApiPropertyOptional({ description: 'Obligatorio en un traslado externo.' })
  @ValidateIf((dto: TransferDto) => dto.kind === 'EXTERNAL')
  @RequiredText('La iglesia destino', 150, 3)
  externalDestinationName?: string;

  @RequiredDate('La fecha del traslado')
  transferDate!: string;

  @RequiredText('El motivo', 255)
  reason!: string;
}
