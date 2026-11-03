import { addYears, sedeReference } from './certificate-document';

describe('certificate document helpers', () => {
  it('adds whole years and handles 29 February', () => {
    expect(addYears('2026-11-02', 2)).toBe('2028-11-02');
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28');
  });

  it('refers to the sede with the right article', () => {
    expect(sedeReference('Sede Central')).toBe('la Sede Central');
    expect(sedeReference('Vida Nueva Chapinero')).toBe('la sede Vida Nueva Chapinero');
  });
});
