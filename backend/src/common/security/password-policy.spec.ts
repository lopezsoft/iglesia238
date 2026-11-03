import { InvalidInputException } from '../errors/domain.exception.js';
import {
  assertStrongPassword,
  findPasswordProblem,
} from './password-policy.js';

describe('findPasswordProblem', () => {
  it('accepts a reasonable password', () => {
    expect(findPasswordProblem('Cordero2026Fuerte')).toBeNull();
  });

  it.each([
    ['short1', 'al menos'],
    ['sololetrasaqui', 'letras y números'],
    ['12345678901234', 'letras y números'],
    ['aaaa1111aaaa1111', 'repetitiva'],
  ])('rejects %j', (password, fragment) => {
    expect(findPasswordProblem(password)).toContain(fragment);
  });

  it('rejects a password longer than the limit', () => {
    expect(findPasswordProblem(`a1${'b'.repeat(200)}`)).toContain('superar');
  });

  it('rejects a password that contains the email, in any case', () => {
    expect(
      findPasswordProblem('MARIA.perez-2026x', [
        'maria.perez@iglesia.org',
        'maria.perez',
      ]),
    ).toContain('correo');
  });

  it('ignores personal values that are too short to mean anything', () => {
    expect(findPasswordProblem('Cordero2026Fuerte', ['ab'])).toBeNull();
  });
});

describe('assertStrongPassword', () => {
  it('throws a 400 with the WEAK_PASSWORD code', () => {
    try {
      assertStrongPassword('corta');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidInputException);
      expect((error as InvalidInputException).code).toBe('WEAK_PASSWORD');
    }
  });

  it('does not throw for a strong password', () => {
    expect(() => assertStrongPassword('Cordero2026Fuerte')).not.toThrow();
  });
});
