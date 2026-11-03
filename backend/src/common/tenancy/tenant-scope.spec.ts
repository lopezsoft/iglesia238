import { TenantScope } from './tenant-scope.js';

describe('TenantScope', () => {
  it('builds the where fragment with only the denomination', () => {
    expect(TenantScope.of(4).where()).toEqual({ denominationId: 4 });
  });

  it('adds the congregation when the scope has one', () => {
    expect(TenantScope.of(4, 9).where()).toEqual({
      denominationId: 4,
      congregationId: 9,
    });
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects the denomination id %s', (id) => {
    expect(() => TenantScope.of(id)).toThrow('denominationId');
  });

  it('rejects an invalid congregation id', () => {
    expect(() => TenantScope.of(1, 0)).toThrow('congregationId');
  });

  it('narrows to a congregation without leaving the denomination', () => {
    const narrowed = TenantScope.of(4).forCongregation(9);

    expect(narrowed.where()).toEqual({ denominationId: 4, congregationId: 9 });
  });

  it('requires a congregation only when asked to', () => {
    expect(TenantScope.of(4, 9).requireCongregationId()).toBe(9);
    expect(() => TenantScope.of(4).requireCongregationId()).toThrow(
      'congregation scope',
    );
  });

  it('is immutable', () => {
    const scope = TenantScope.of(1, 2);

    expect(() => {
      (scope as { denominationId: number }).denominationId = 99;
    }).toThrow();
  });
});
