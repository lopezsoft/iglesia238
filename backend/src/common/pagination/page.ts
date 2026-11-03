import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Same shape as Page<T> in the frontend (shared/utils/pagination.ts). */
export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

const toInt = ({ value }: { value: unknown }): unknown =>
  value === undefined || value === '' ? undefined : Number(value);

/** Query parameters of a paginated list. Other query DTOs extend it. */
export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Transform(toInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
  })
  @Transform(toInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}

/** Base for the Swagger response of a paginated list; subclasses declare `items`. */
export abstract class PageResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

/** `skip` and `take` for Prisma. */
export function toSkipTake({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function buildPage<T>(
  items: readonly T[],
  total: number,
  { page, pageSize }: { page: number; pageSize: number },
): Page<T> {
  return { items, total, page, pageSize };
}

/** Maps the items of a page without touching its metadata. */
export function mapPage<T, R>(page: Page<T>, mapper: (item: T) => R): Page<R> {
  return { ...page, items: page.items.map(mapper) };
}
