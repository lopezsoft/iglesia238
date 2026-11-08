import { InvalidInputException } from '../../../common/errors/domain.exception.js';
import { CertificateErrorCode } from './certificate-errors.js';
import {
  TEMPLATE_LIMITS,
  validatedTypeChanges,
  VALIDITY_DAYS_MAX,
} from './certificate-type-rules.js';

function rejection(run: () => unknown): InvalidInputException & {
  code: string;
} {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidInputException);
    return error as InvalidInputException & { code: string };
  }
  throw new Error('Expected the changes to be rejected');
}

describe('validatedTypeChanges', () => {
  it('returns only the fields that came in', () => {
    expect(validatedTypeChanges({})).toEqual({});
    expect(validatedTypeChanges({ introTemplate: 'Hace constar' })).toEqual({
      introTemplate: 'Hace constar',
    });
  });

  it('trims the texts and stores a blank one as null (the default text)', () => {
    expect(
      validatedTypeChanges({
        name: '  Certificado de membresía  ',
        template: '   ',
        introTemplate: '',
        closingTemplate: null,
        pastorTitleTemplate: '  Pastor titular  ',
      }),
    ).toEqual({
      name: 'Certificado de membresía',
      template: null,
      introTemplate: null,
      closingTemplate: null,
      pastorTitleTemplate: 'Pastor titular',
    });
  });

  it('rejects a placeholder that does not exist and names it', () => {
    const error = rejection(() =>
      validatedTypeChanges({ introTemplate: 'Hola {{memberNmae}}' }),
    );

    expect(error.code).toBe(CertificateErrorCode.CERTIFICATE_TEMPLATE_INVALID);
    expect(error.message).toContain('{{memberNmae}}');
    expect(error.message).toContain('El encabezado');
  });

  it('rejects braces that do not form a placeholder', () => {
    const error = rejection(() =>
      validatedTypeChanges({ closingTemplate: 'Dado en {{city' }),
    );

    expect(error.code).toBe(CertificateErrorCode.CERTIFICATE_TEMPLATE_INVALID);
    expect(error.message).toContain('El cierre');
  });

  it('rejects a text longer than the limit of its column, and accepts one at the limit', () => {
    for (const [field, limit] of Object.entries(TEMPLATE_LIMITS)) {
      expect(() =>
        validatedTypeChanges({ [field]: 'a'.repeat(limit) }),
      ).not.toThrow();
      expect(
        rejection(() =>
          validatedTypeChanges({ [field]: 'a'.repeat(limit + 1) }),
        ).code,
      ).toBe(CertificateErrorCode.CERTIFICATE_TEMPLATE_INVALID);
    }
  });

  it('validates the name', () => {
    for (const name of ['', '  ab  ', 'x'.repeat(101)]) {
      expect(rejection(() => validatedTypeChanges({ name })).code).toBe(
        CertificateErrorCode.CERTIFICATE_TYPE_INVALID,
      );
    }
    expect(validatedTypeChanges({ name: 'Carta' })).toEqual({ name: 'Carta' });
  });

  it('validates the validity: whole days, from 1 up to the maximum, or null for no expiry', () => {
    for (const validityDays of [0, -5, 1.5, VALIDITY_DAYS_MAX + 1]) {
      expect(rejection(() => validatedTypeChanges({ validityDays })).code).toBe(
        CertificateErrorCode.CERTIFICATE_TYPE_INVALID,
      );
    }
    expect(validatedTypeChanges({ validityDays: 90 })).toEqual({
      validityDays: 90,
    });
    expect(validatedTypeChanges({ validityDays: null })).toEqual({
      validityDays: null,
    });
  });
});
