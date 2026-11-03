import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Composite decorators for the DTOs of the membership module: each one validates, documents the
// property in Swagger and answers with a Spanish message that is safe to show to the user.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const RequiredText = (label: string, max: number, min = 1) =>
  applyDecorators(
    ApiProperty({ maxLength: max, minLength: min, description: label }),
    IsString({ message: `${label} no es válido.` }),
    IsNotEmpty({ message: `${label} es obligatorio.` }),
    MinLength(min, {
      message: `${label} debe tener al menos ${min} caracteres.`,
    }),
    MaxLength(max, { message: `${label} admite máximo ${max} caracteres.` }),
  );

/** Optional text; `null` and a missing value both mean "empty". */
export const OptionalText = (label: string, max: number) =>
  applyDecorators(
    ApiPropertyOptional({ maxLength: max, nullable: true, description: label }),
    IsOptional(),
    IsString({ message: `${label} no es válido.` }),
    MaxLength(max, { message: `${label} admite máximo ${max} caracteres.` }),
  );

export const RequiredDate = (label: string) =>
  applyDecorators(
    ApiProperty({
      example: '2026-11-02',
      description: `${label} (AAAA-MM-DD)`,
    }),
    Matches(DATE_ONLY, {
      message: `${label} debe tener el formato AAAA-MM-DD.`,
    }),
  );

export const OptionalDate = (label: string) =>
  applyDecorators(
    ApiPropertyOptional({
      example: '2026-11-02',
      nullable: true,
      description: `${label} (AAAA-MM-DD)`,
    }),
    IsOptional(),
    Matches(DATE_ONLY, {
      message: `${label} debe tener el formato AAAA-MM-DD.`,
    }),
  );

export const RequiredInt = (label: string, min = 1, max = 2_147_483_647) =>
  applyDecorators(
    ApiProperty({ minimum: min, maximum: max, description: label }),
    Type(() => Number),
    IsInt({ message: `${label} no es válido.` }),
    Min(min, { message: `${label} no es válido.` }),
    Max(max, { message: `${label} no es válido.` }),
  );

export const OptionalInt = (label: string, min = 1, max = 2_147_483_647) =>
  applyDecorators(
    ApiPropertyOptional({
      minimum: min,
      maximum: max,
      nullable: true,
      description: label,
    }),
    IsOptional(),
    Type(() => Number),
    IsInt({ message: `${label} no es válido.` }),
    Min(min, { message: `${label} no es válido.` }),
    Max(max, { message: `${label} no es válido.` }),
  );

export const OptionalBoolean = (label: string) =>
  applyDecorators(
    ApiPropertyOptional({ nullable: true, type: Boolean, description: label }),
    IsOptional(),
    IsBoolean({ message: `${label} debe ser verdadero o falso.` }),
  );

export const RequiredBoolean = (label: string) =>
  applyDecorators(
    ApiProperty({ type: Boolean, description: label }),
    IsBoolean({ message: `${label} debe ser verdadero o falso.` }),
  );

export const OneOf = (label: string, values: readonly string[]) =>
  applyDecorators(
    ApiProperty({ enum: values, description: label }),
    IsIn(values, { message: `${label} no es válido.` }),
  );

export const OptionalOneOf = (label: string, values: readonly string[]) =>
  applyDecorators(
    ApiPropertyOptional({ enum: values, nullable: true, description: label }),
    IsOptional(),
    IsIn(values, { message: `${label} no es válido.` }),
  );

/** A query parameter that has a default: an absent value keeps the default of the property. */
export const QueryOneOf = (label: string, values: readonly string[]) =>
  applyDecorators(
    ApiPropertyOptional({ enum: values, description: label }),
    IsOptional(),
    IsIn(values, { message: `${label} no es válido.` }),
  );
