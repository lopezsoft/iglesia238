import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PageQueryDto,
  buildPage,
  mapPage,
  toSkipTake,
} from './page.js';

const parse = (query: Record<string, unknown>) => {
  const dto = plainToInstance(PageQueryDto, query);
  return { dto, errors: validateSync(dto) };
};

describe('PageQueryDto', () => {
  it('uses the defaults when the query is empty', () => {
    const { dto, errors } = parse({});

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('converts the query strings to numbers', () => {
    const { dto, errors } = parse({ page: '3', pageSize: '50' });

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 3, pageSize: 50 });
  });

  it.each([
    { page: '0' },
    { page: '-1' },
    { page: 'abc' },
    { page: '1.5' },
    { pageSize: '0' },
    { pageSize: String(MAX_PAGE_SIZE + 1) },
  ])('rejects %o', (query) => {
    expect(parse(query).errors.length).toBeGreaterThan(0);
  });
});

describe('page helpers', () => {
  it('computes skip and take', () => {
    expect(toSkipTake({ page: 1, pageSize: 25 })).toEqual({
      skip: 0,
      take: 25,
    });
    expect(toSkipTake({ page: 3, pageSize: 10 })).toEqual({
      skip: 20,
      take: 10,
    });
  });

  it('builds a page with its metadata', () => {
    expect(buildPage(['a'], 11, { page: 2, pageSize: 10 })).toEqual({
      items: ['a'],
      total: 11,
      page: 2,
      pageSize: 10,
    });
  });

  it('maps the items and keeps the metadata', () => {
    const page = buildPage([1, 2], 9, { page: 1, pageSize: 2 });

    expect(mapPage(page, (n) => n * 2)).toEqual({
      items: [2, 4],
      total: 9,
      page: 1,
      pageSize: 2,
    });
  });
});
