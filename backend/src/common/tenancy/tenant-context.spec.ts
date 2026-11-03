import {
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../errors/domain.exception.js';
import { buildTenantContext } from '../../../test/support/tenants.js';

describe('TenantContext', () => {
  it('checks permissions', () => {
    const context = buildTenantContext({ permissions: ['a', 'b'] });

    expect(context.has('a')).toBe(true);
    expect(context.hasAll('a', 'b')).toBe(true);
    expect(context.hasAll('a', 'c')).toBe(false);
    expect(context.hasAny('c', 'b')).toBe(true);
    expect(context.hasAny('c', 'd')).toBe(false);
  });

  describe('tenantScope', () => {
    it('never serves the platform scope to tenant tables', () => {
      const platform = buildTenantContext({ kind: 'PLATFORM' });

      expect(() => platform.tenantScope()).toThrow(ForbiddenDomainException);
    });

    it('carries the congregation of a congregation scope', () => {
      expect(buildTenantContext().tenantScope().where()).toEqual({
        denominationId: 1,
        congregationId: 10,
      });
    });

    it('is denomination-wide in a denomination scope', () => {
      const context = buildTenantContext({ kind: 'DENOMINATION' });

      expect(context.tenantScope().where()).toEqual({ denominationId: 1 });
    });
  });

  describe('congregationScope', () => {
    it('uses the fixed congregation of a congregation scope', () => {
      const context = buildTenantContext();

      expect(context.congregationScope().congregationId).toBe(10);
      expect(context.congregationScope(10).congregationId).toBe(10);
    });

    it('answers 404 when a congregation scope asks for another congregation', () => {
      expect(() => buildTenantContext().congregationScope(11)).toThrow(
        NotFoundDomainException,
      );
    });

    it('lets a denomination scope choose a congregation, and requires it', () => {
      const context = buildTenantContext({ kind: 'DENOMINATION' });

      expect(context.congregationScope(11).where()).toEqual({
        denominationId: 1,
        congregationId: 11,
      });
      expect(() => context.congregationScope()).toThrow(InvalidInputException);
    });
  });
});
