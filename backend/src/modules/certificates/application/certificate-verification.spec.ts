import {
  maskHolderName,
  verificationStatus,
} from './certificate-verification.js';

describe('maskHolderName', () => {
  it('keeps the first name and reduces the rest to initials', () => {
    expect(maskHolderName('Ana María Rojas Díaz')).toBe('Ana M. R. D.');
  });

  it('leaves a single word alone and tolerates extra spaces', () => {
    expect(maskHolderName('Ana')).toBe('Ana');
    expect(maskHolderName('  Ana   rojas ')).toBe('Ana R.');
  });

  it('answers an empty string for an empty name', () => {
    expect(maskHolderName('   ')).toBe('');
  });
});

describe('verificationStatus', () => {
  const today = '2026-11-08';

  it('is valid when the certificate does not expire', () => {
    expect(verificationStatus({ voidedAt: null, expiresOn: null, today })).toBe(
      'VALID',
    );
  });

  it('is valid through the expiry day and expired the day after', () => {
    expect(
      verificationStatus({ voidedAt: null, expiresOn: '2026-11-08', today }),
    ).toBe('VALID');
    expect(
      verificationStatus({ voidedAt: null, expiresOn: '2026-11-07', today }),
    ).toBe('EXPIRED');
  });

  it('is voided whatever its expiry date says', () => {
    expect(
      verificationStatus({
        voidedAt: new Date('2026-11-03T10:00:00Z'),
        expiresOn: '2030-01-01',
        today,
      }),
    ).toBe('VOIDED');
  });
});
