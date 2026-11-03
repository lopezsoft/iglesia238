import { Scope, scopeCovers, scopeHeader } from './session.model';

const platform: Scope = { kind: 'PLATFORM', denominationId: null, congregationId: null, label: 'Plataforma' };
const denominationA: Scope = { kind: 'DENOMINATION', denominationId: 1, congregationId: null, label: 'A' };
const sedeA1: Scope = { kind: 'CONGREGATION', denominationId: 1, congregationId: 1, label: 'A1' };
const sedeA2: Scope = { kind: 'CONGREGATION', denominationId: 1, congregationId: 2, label: 'A2' };
const sedeB1: Scope = { kind: 'CONGREGATION', denominationId: 2, congregationId: 4, label: 'B1' };

describe('scopeCovers', () => {
  it('applies a platform role only on the platform', () => {
    expect(scopeCovers(platform, platform)).toBe(true);
    expect(scopeCovers(platform, sedeA1)).toBe(false);
  });

  it('applies a denomination role to the denomination and its own sedes only', () => {
    expect(scopeCovers(denominationA, denominationA)).toBe(true);
    expect(scopeCovers(denominationA, sedeA2)).toBe(true);
    expect(scopeCovers(denominationA, sedeB1)).toBe(false);
    expect(scopeCovers(denominationA, platform)).toBe(false);
  });

  it('applies a sede role to that sede only', () => {
    expect(scopeCovers(sedeA1, sedeA1)).toBe(true);
    expect(scopeCovers(sedeA1, sedeA2)).toBe(false);
    expect(scopeCovers(sedeA1, denominationA)).toBe(false);
  });
});

describe('scopeHeader', () => {
  it('writes the X-Scope value the API validates against UserRole.scopeKey', () => {
    expect(scopeHeader(platform)).toBe('P');
    expect(scopeHeader(denominationA)).toBe('D:1');
    expect(scopeHeader(sedeA2)).toBe('C:2');
  });
});
