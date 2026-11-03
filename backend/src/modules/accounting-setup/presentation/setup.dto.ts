import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CONTRIBUTION_CATEGORIES,
  type AccountNatureValue,
  type ContributionCategoryValue,
} from '../application/setup.views.js';

const CATEGORIES = [...CONTRIBUTION_CATEGORIES];
const NATURES = ['INCOME', 'EXPENSE'];

// --- Requests --------------------------------------------------------------------------------------

export class SaveFundDto {
  @ApiProperty({ minLength: 3, maxLength: 120, example: 'Fondo Local' })
  @IsString({ message: 'El nombre del fondo es obligatorio.' })
  @MaxLength(255, { message: 'El nombre del fondo es demasiado largo.' })
  name!: string;

  @ApiProperty()
  @IsBoolean({ message: 'Indica si el fondo está activo.' })
  isActive!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Saldo inicial del año en la sede activa. Null conserva el actual; un valor exige una sede.',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El saldo inicial debe ser un número.' })
  openingBalance: number | null = null;
}

export class CreateAccountDto {
  @ApiPropertyOptional({ nullable: true, description: 'Cuenta padre (grupo).' })
  @IsOptional()
  @IsInt({ message: 'La cuenta padre no es válida.' })
  @Min(1)
  parentId: number | null = null;

  @ApiProperty({ example: '410505', description: 'Solo dígitos, máximo 20.' })
  @IsString({ message: 'El código de la cuenta es obligatorio.' })
  @MaxLength(40)
  code!: string;

  @ApiProperty({ minLength: 3, maxLength: 150 })
  @IsString({ message: 'El nombre de la cuenta es obligatorio.' })
  @MaxLength(300)
  name!: string;

  @ApiProperty({ enum: NATURES })
  @IsIn(NATURES, { message: 'La naturaleza de la cuenta no es válida.' })
  nature!: AccountNatureValue;

  @ApiProperty({ description: 'Los grupos no reciben movimientos.' })
  @IsBoolean({ message: 'Indica si la cuenta es imputable.' })
  isPostable!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Fondo sugerido: los aportes de sus tipos se consolidan allí.',
  })
  @IsOptional()
  @IsInt({ message: 'El fondo sugerido no es válido.' })
  @Min(1)
  defaultFundId: number | null = null;
}

/** El padre y la naturaleza no cambian una vez creada la cuenta. */
export class UpdateAccountDto {
  @ApiProperty({ example: '410505' })
  @IsString({ message: 'El código de la cuenta es obligatorio.' })
  @MaxLength(40)
  code!: string;

  @ApiProperty({ minLength: 3, maxLength: 150 })
  @IsString({ message: 'El nombre de la cuenta es obligatorio.' })
  @MaxLength(300)
  name!: string;

  @ApiProperty()
  @IsBoolean({ message: 'Indica si la cuenta es imputable.' })
  isPostable!: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt({ message: 'El fondo sugerido no es válido.' })
  @Min(1)
  defaultFundId: number | null = null;
}

export class SetActiveDto {
  @ApiProperty()
  @IsBoolean({ message: 'Indica si el registro queda activo.' })
  isActive!: boolean;
}

export class SaveContributionTypeDto {
  @ApiProperty({
    example: 'DIEZMO',
    description: '2 a 30: A-Z, 0-9 y guion bajo.',
  })
  @IsString({ message: 'El código del tipo es obligatorio.' })
  @MaxLength(60)
  code!: string;

  @ApiProperty({ minLength: 3, maxLength: 100 })
  @IsString({ message: 'El nombre del tipo es obligatorio.' })
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: CATEGORIES })
  @IsIn(CATEGORIES, { message: 'La categoría no es válida.' })
  category!: ContributionCategoryValue;

  @ApiProperty({
    description: 'Cuenta imputable de ingreso que recibe estos aportes.',
  })
  @IsInt({ message: 'Elige la cuenta del tipo de aporte.' })
  @Min(1)
  accountId!: number;
}

export class OpenPeriodDto {
  @ApiProperty({ example: 2026 })
  @IsInt({ message: 'Indica el año del periodo.' })
  @Min(2000)
  @Max(2200)
  year!: number;

  @ApiProperty({ minimum: 1, maximum: 12, example: 11 })
  @IsInt({ message: 'Indica el mes del periodo.' })
  @Min(1)
  @Max(12)
  month!: number;
}

export class SaveTitheRuleDto {
  @ApiProperty({
    example: '2026-01-01',
    description: 'Primer día en que aplica.',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de inicio debe tener el formato AAAA-MM-DD.',
  })
  effectiveFrom!: string;

  @ApiProperty({
    minimum: 0,
    maximum: 1,
    description:
      'Porcentaje nacional como fracción (0.21 = 21 %), hasta 4 decimales.',
  })
  @IsNumber({}, { message: 'El porcentaje nacional debe ser un número.' })
  @Min(0)
  @Max(1)
  nationalShareRate!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 1,
    description:
      'Porcentaje del fondo local sobre el diezmo después del nacional.',
  })
  @IsNumber(
    {},
    { message: 'El porcentaje del fondo local debe ser un número.' },
  )
  @Min(0)
  @Max(1)
  localFundRate!: number;
}

// --- Responses -------------------------------------------------------------------------------------

export class PeriodOptionDto {
  @ApiProperty() year!: number;
  @ApiProperty() month!: number;
  @ApiProperty({ enum: ['OPEN', 'CLOSED'] }) status!: 'OPEN' | 'CLOSED';
  @ApiProperty({ example: 'Noviembre 2026' }) label!: string;
}

export class PeriodDto extends PeriodOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty({ nullable: true, type: String }) closedAt!: string | null;
  @ApiProperty({ example: '2026-11-01' }) from!: string;
  @ApiProperty({ example: '2026-11-30' }) to!: string;
}

export class TitheRuleDto {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty({ example: '2026-01-01' }) effectiveFrom!: string;
  @ApiProperty() nationalShareRate!: number;
  @ApiProperty() localFundRate!: number;
  @ApiProperty({ description: 'Es el porcentaje que aplica hoy.' })
  inForce!: boolean;
  @ApiProperty({
    description: 'Hay liquidaciones emitidas con él: no se modifica.',
  })
  inUse!: boolean;
}

export class SetupOverviewDto {
  @ApiProperty({ example: '2026-11-02', description: 'Hoy en America/Bogota.' })
  today!: string;
  @ApiProperty() year!: number;
  @ApiProperty() activeFunds!: number;
  @ApiProperty() totalFunds!: number;
  @ApiProperty() openingTotal!: number;
  @ApiProperty({ type: PeriodOptionDto, nullable: true })
  currentPeriod!: PeriodOptionDto | null;
  @ApiProperty() congregationScoped!: boolean;
  @ApiProperty() scopeLabel!: string;
  @ApiProperty({ nullable: true, type: Number }) periodsCount!: number | null;
  @ApiProperty({ type: TitheRuleDto, nullable: true })
  titheRule!: TitheRuleDto | null;
}

export class FundDto {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() openingBalance!: number;
  @ApiProperty() openingLocked!: boolean;
  @ApiProperty() inUse!: boolean;
}

export class AccountDto {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty({ nullable: true, type: Number }) defaultFundId!: number | null;
  @ApiProperty({ nullable: true, type: Number }) parentId!: number | null;
  @ApiProperty() code!: string;
  @ApiProperty({ nullable: true, type: String }) legacyCode!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: NATURES }) nature!: AccountNatureValue;
  @ApiProperty() isPostable!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() depth!: number;
  @ApiProperty() hasChildren!: boolean;
  @ApiProperty() hasMovements!: boolean;
  @ApiProperty() linkedTypes!: number;
  @ApiProperty({ nullable: true, type: String }) defaultFundName!:
    string | null;
}

export class ContributionTypeDto {
  @ApiProperty() id!: number;
  @ApiProperty() denominationId!: number;
  @ApiProperty({ enum: CATEGORIES }) category!: ContributionCategoryValue;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() accountId!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() accountCode!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() contributionCount!: number;
}
