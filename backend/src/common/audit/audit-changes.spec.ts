import {
  buildAuditChanges,
  SensitiveAuditFieldError,
} from './audit-changes.js';

describe('buildAuditChanges', () => {
  it('reports only the fields that changed', () => {
    const changes = buildAuditChanges(
      { name: 'Sede Norte', isActive: true, code: 'SN' },
      { name: 'Sede Norte', isActive: false, code: 'SN' },
      ['name', 'isActive', 'code'],
    );

    expect(changes).toEqual({ isActive: { from: true, to: false } });
  });

  it('reports every non-empty field on creation', () => {
    const changes = buildAuditChanges(
      null,
      { name: 'Sede Norte', code: 'SN', notes: null },
      ['name', 'code'],
    );

    expect(changes).toEqual({
      name: { from: null, to: 'Sede Norte' },
      code: { from: null, to: 'SN' },
    });
  });

  it('ignores fields that were not listed', () => {
    const changes = buildAuditChanges({ a: 1, b: 1 }, { a: 2, b: 2 }, ['a']);

    expect(Object.keys(changes)).toEqual(['a']);
  });

  it('normalizes dates, decimals and undefined', () => {
    const changes = buildAuditChanges(
      { amount: { toNumber: () => 10.5 }, closedOn: undefined },
      {
        amount: { toNumber: () => 12 },
        closedOn: new Date('2026-10-31T00:00:00Z'),
      },
      ['amount', 'closedOn'],
    );

    expect(changes).toEqual({
      amount: { from: 10.5, to: 12 },
      closedOn: { from: null, to: '2026-10-31T00:00:00.000Z' },
    });
  });

  it('treats null and undefined as the same empty value', () => {
    expect(buildAuditChanges({ a: null }, { a: undefined }, ['a'])).toEqual({});
  });

  it('truncates long text', () => {
    const changes = buildAuditChanges(null, { reason: 'x'.repeat(500) }, [
      'reason',
    ]);

    expect((changes.reason.to as string).length).toBeLessThanOrEqual(201);
  });

  it.each([
    'password',
    'passwordHash',
    'email',
    'documentNumber',
    'phone',
    'fullName',
    'address',
    'birthDate',
    'token',
    'notes',
  ])('refuses to audit the field %s', (field) => {
    expect(() => buildAuditChanges(null, { [field]: 'x' }, [field])).toThrow(
      SensitiveAuditFieldError,
    );
  });
});
