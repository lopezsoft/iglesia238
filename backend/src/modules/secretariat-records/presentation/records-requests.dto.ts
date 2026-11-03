import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page.js';
import {
  NormalizedOptionalText,
  NormalizedText,
} from '../../../common/validation/text-transforms.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Indica una fecha válida (aaaa-mm-dd).';

// ---------- Child dedications ----------

export class ParentInputDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Persona registrada. Tiene prioridad sobre el nombre.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La persona seleccionada no es válida.' })
  @Min(1)
  personId?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 120,
    description:
      'Nombre libre cuando no está registrado; se crea una persona solo con el nombre.',
  })
  @IsOptional()
  @NormalizedOptionalText()
  @IsString({ message: 'El nombre no es válido.' })
  @MaxLength(120, { message: 'El nombre admite máximo 120 caracteres.' })
  name?: string | null;
}

export class CreateChildDedicationDto {
  @ApiProperty({ description: 'Sede donde se presenta.' })
  @Type(() => Number)
  @IsInt({ message: 'Selecciona la sede de la presentación.' })
  @Min(1)
  congregationId!: number;

  @ApiProperty({ description: 'Persona del niño o la niña.' })
  @Type(() => Number)
  @IsInt({ message: 'Selecciona al niño o la niña.' })
  @Min(1)
  childId!: number;

  @ApiProperty({
    example: '2026-10-25',
    description: 'No puede ser futura ni anterior al nacimiento.',
  })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  dedicatedOn!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Oficiante.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pastorId?: number | null;

  @ApiPropertyOptional({ type: ParentInputDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ParentInputDto)
  father?: ParentInputDto | null;

  @ApiPropertyOptional({ type: ParentInputDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ParentInputDto)
  mother?: ParentInputDto | null;

  @ApiPropertyOptional({
    type: ParentInputDto,
    nullable: true,
    description: 'Acudiente. Se exige al menos padre, madre o acudiente.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ParentInputDto)
  guardian?: ParentInputDto | null;
}

export class ListChildDedicationsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  congregationId?: number;

  @ApiPropertyOptional({ description: 'Nombre del niño o la niña.' })
  @IsOptional()
  @NormalizedText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  to?: string;
}

// ---------- Marriages ----------

export class CreateMarriageDto {
  @ApiProperty({ description: 'Persona del primer cónyuge.' })
  @Type(() => Number)
  @IsInt({ message: 'Selecciona el primer cónyuge.' })
  @Min(1)
  spouse1Id!: number;

  @ApiProperty({ description: 'Persona del segundo cónyuge.' })
  @Type(() => Number)
  @IsInt({ message: 'Selecciona el segundo cónyuge.' })
  @Min(1)
  spouse2Id!: number;

  @ApiProperty({
    example: '2026-07-18',
    description:
      'No puede ser futura; ambos cónyuges deben ser mayores de edad ese día.',
  })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  marriedOn!: string;

  @ApiProperty({ maxLength: 150, example: 'Sede Central · Templo principal' })
  @NormalizedText()
  @IsString({ message: 'Indica el lugar de la ceremonia.' })
  @MaxLength(150, { message: 'El lugar admite máximo 150 caracteres.' })
  place!: string;

  @ApiProperty({ enum: ['NOTARY', 'CHURCH'] })
  @IsIn(['NOTARY', 'CHURCH'], {
    message: 'Selecciona dónde quedó registrado el matrimonio.',
  })
  registeredWith!: 'NOTARY' | 'CHURCH';

  @ApiPropertyOptional({ nullable: true, description: 'Oficiante.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  officiantId?: number | null;
}

export class DissolveMarriageDto {
  @ApiProperty({
    example: '2026-09-01',
    description: 'No puede ser futura ni anterior al matrimonio.',
  })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  endedOn!: string;

  @ApiProperty({ enum: ['DIVORCE', 'DEATH', 'ANNULMENT'] })
  @IsIn(['DIVORCE', 'DEATH', 'ANNULMENT'], {
    message: 'Selecciona el motivo de la disolución.',
  })
  endReason!: 'DIVORCE' | 'DEATH' | 'ANNULMENT';
}

export class ListMarriagesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'dissolved'] })
  @IsOptional()
  @IsIn(['active', 'dissolved'], {
    message: 'El estado debe ser vigente o disuelto.',
  })
  status?: 'active' | 'dissolved';

  @ApiPropertyOptional({ description: 'Nombre de alguno de los cónyuges.' })
  @IsOptional()
  @NormalizedText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Fecha del matrimonio desde.',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Fecha del matrimonio hasta.',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  to?: string;
}

// ---------- Pastoral terms ----------

export class CreatePastoralTermDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt({ message: 'Selecciona la sede del periodo.' })
  @Min(1)
  congregationId!: number;

  @ApiProperty({ description: 'Persona del pastor o la pastora.' })
  @Type(() => Number)
  @IsInt({ message: 'Selecciona al pastor o la pastora.' })
  @Min(1)
  pastorId!: number;

  @ApiProperty({ example: '2026-11-01' })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  startedOn!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: 'Vacío si es el periodo actual.',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  endedOn?: string | null;

  @ApiPropertyOptional({
    default: false,
    description:
      'Cierra el periodo abierto de la sede el día anterior al inicio del nuevo.',
  })
  @IsOptional()
  @IsBoolean()
  closeCurrent?: boolean;
}

export class ClosePastoralTermDto {
  @ApiProperty({
    example: '2026-10-31',
    description: 'No puede ser futura ni anterior al inicio.',
  })
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  endedOn!: string;
}

export class ListPastoralTermsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  congregationId?: number;

  @ApiPropertyOptional({
    description: 'Solo los periodos abiertos (pastores actuales).',
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  current?: boolean;
}

// ---------- People ----------

export class SearchRecordPeopleQueryDto {
  @ApiProperty({
    minLength: 2,
    description: 'Nombre, documento o código de miembro (SC-0130).',
  })
  @NormalizedText()
  @IsString({ message: 'Escribe el nombre o el documento de la persona.' })
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ default: 8, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    enum: ['child', 'spouse', 'parent', 'pastor', 'officiant'],
    description:
      'Para quién se busca: acota por edad y descarta a quien ya tiene un matrimonio vigente.',
  })
  @IsOptional()
  @IsIn(['child', 'spouse', 'parent', 'pastor', 'officiant'])
  eligibleFor?: 'child' | 'spouse' | 'parent' | 'pastor' | 'officiant';
}
