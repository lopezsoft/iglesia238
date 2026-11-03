import {
  FixedClock,
  ImmediateTransactionRunner,
  RecordingAuditRecorder,
} from '../../../../test/support/foundation-fakes.js';
import {
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
  TooManyRequestsException,
} from '../../../common/errors/domain.exception.js';
import type { MailMessage } from '../../../common/mail/mailer.port.js';
import type { RateLimitService } from '../../../common/rate-limit/rate-limit.service.js';
import { hashOpaqueToken } from '../../../common/security/opaque-token.js';
import {
  FakeHasher,
  FakeMailer,
  FakeRateLimit,
} from '../../auth/application/testing/auth-fakes.js';
import {
  ListPublicLegalEntitiesUseCase,
  maskTaxId,
} from './public-reads.use-cases.js';
import {
  REGISTRATION_ROLE_CODES,
  RegisterCongregationUseCase,
  type RegisterCongregationInput,
} from './register-congregation.use-case.js';
import { InMemoryPublicWorld } from './testing/in-memory-public.js';
import { InMemoryRegistrationWorld } from './testing/in-memory-registration.js';

const PASSWORD = 'Cordero-2026-Fuerte';

function input(
  overrides: {
    legalEntityId?: number;
    congregation?: Partial<RegisterCongregationInput['congregation']>;
    manager?: Partial<RegisterCongregationInput['manager']>;
  } = {},
): RegisterCongregationInput {
  return {
    legalEntityId: overrides.legalEntityId ?? 12,
    congregation: {
      name: 'Monte de Sión Cartagena',
      municipalityCode: '13001',
      address: 'Calle 1 # 2-3',
      phone: '3001234567',
      email: 'sede@iglesia.org',
      ...overrides.congregation,
    },
    manager: {
      displayName: 'Laura Gómez',
      email: 'laura@iglesia.org',
      password: PASSWORD,
      ...overrides.manager,
    },
  };
}

function setup(options: { exposeDevLinks?: boolean } = {}) {
  const world = new InMemoryRegistrationWorld();
  const audit = new RecordingAuditRecorder();
  const mailer = new FakeMailer();
  const hasher = new FakeHasher();
  const rateLimit = new FakeRateLimit();
  const clock = new FixedClock();
  const register = new RegisterCongregationUseCase(
    world,
    hasher,
    new ImmediateTransactionRunner(),
    audit,
    mailer,
    { appBaseUrl: 'https://app.test' },
    options.exposeDevLinks ?? true,
    rateLimit as unknown as RateLimitService,
    clock,
  );
  return { world, audit, mailer, hasher, rateLimit, clock, register };
}

/** The raw token inside the confirmation link that was mailed. */
function tokenOf(message: MailMessage | undefined): string {
  const match = /token=([\w-]+)/.exec(message?.text ?? '');
  if (!match) {
    throw new Error('The mail has no link');
  }
  return match[1];
}

describe('RegisterCongregationUseCase', () => {
  it('creates the congregation and the unverified user, with a hashed password and the congregation roles', async () => {
    const { world, register } = setup();

    const receipt = await register.execute(input(), '10.0.0.7');

    expect(receipt).toMatchObject({
      emailVerificationRequired: true,
      congregationName: 'Monte de Sión Cartagena',
    });
    expect(world.registrations).toHaveLength(1);
    const { command } = world.registrations[0];
    // The denomination comes from the legal entity, never from the client.
    expect(command.congregation).toMatchObject({
      denominationId: 1,
      legalEntityId: 12,
      name: 'Monte de Sión Cartagena',
      municipalityId: 1,
      address: 'Calle 1 # 2-3',
      phone: '3001234567',
      email: 'sede@iglesia.org',
    });
    expect(command.manager).toEqual({
      email: 'laura@iglesia.org',
      displayName: 'Laura Gómez',
      passwordHash: `hash:${PASSWORD}`,
    });
    expect(command.roleCodes).toEqual(['PASTOR', 'SECRETARY', 'TREASURER']);
    expect(command.roleCodes).toEqual([...REGISTRATION_ROLE_CODES]);
  });

  it('generates the code from the initials and numbers it when the denomination already uses it', async () => {
    const { world, register } = setup();
    world.congregations.push({
      denominationId: 1,
      name: 'Otra Sede',
      code: 'MSC',
    });

    await register.execute(input(), null);
    await register.execute(
      input({
        congregation: { name: 'Mar de Sion Caribe' },
        manager: { email: 'otra@iglesia.org' },
      }),
      null,
    );

    expect(world.registrations.map((r) => r.command.congregation.code)).toEqual(
      ['MSC2', 'MSC3'],
    );
  });

  it('stores a one-time confirmation token of 72 hours, only as a hash, and mails the link', async () => {
    const { world, mailer, clock, register } = setup();

    await register.execute(input(), null);

    const { command } = world.registrations[0];
    const [mail] = mailer.sent;
    expect(mail.to).toBe('laura@iglesia.org');
    expect(mail.kind).toBe('EMAIL_VERIFICATION');
    expect(mail.text).toContain('https://app.test/login/verify-email?token=');
    const token = tokenOf(mail);
    expect(command.verification.tokenHash).toBe(hashOpaqueToken(token));
    expect(JSON.stringify(command)).not.toContain(token);
    expect(command.verification.expiresAt.getTime()).toBe(
      clock.now().getTime() + 72 * 3_600_000,
    );
  });

  it('audits the congregation, the user and every role without personal data, tokens or links', async () => {
    const { audit, register } = setup();

    await register.execute(input(), '10.0.0.7');

    expect(audit.entries.map((e) => `${e.entity}:${e.action}`)).toEqual([
      'Congregation:CONGREGATION_REGISTERED',
      'User:USER_REGISTERED',
      'UserRole:ROLE_GRANTED',
      'UserRole:ROLE_GRANTED',
      'UserRole:ROLE_GRANTED',
    ]);
    expect(audit.entries[0]).toMatchObject({
      actor: { denominationId: 1 },
      ipAddress: '10.0.0.7',
      changes: {
        code: { from: null, to: 'MSC' },
        isActive: { from: null, to: true },
      },
    });
    const serialized = JSON.stringify(audit.entries);
    for (const secret of [
      'laura@iglesia.org',
      'Laura',
      PASSWORD,
      '3001234567',
      'Calle 1',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('answers the same and creates nothing when the e-mail already has an account, mailing a notice without links', async () => {
    const { world, audit, mailer, register } = setup();
    const created = await register.execute(
      input({ manager: { email: 'nueva@iglesia.org' } }),
      null,
    );
    mailer.sent.length = 0;
    const registrations = world.registrations.length;
    const congregations = world.congregations.length;
    audit.entries.length = 0;

    const existing = await register.execute(
      input({
        congregation: { name: 'Otra Sede Distinta' },
        manager: { email: 'Existente@Iglesia.org' },
      }),
      null,
    );

    // Same shape as a real registration (with SMTP configured, no development link in either).
    expect(Object.keys(existing)).toEqual(Object.keys(created));
    expect(existing).toEqual({
      emailVerificationRequired: true,
      congregationName: 'Otra Sede Distinta',
    });
    expect(world.registrations).toHaveLength(registrations);
    expect(world.congregations).toHaveLength(congregations);
    expect(audit.entries).toHaveLength(0);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: 'existente@iglesia.org',
      kind: 'REGISTRATION_NOTICE',
    });
    expect(mailer.sent[0].text).not.toMatch(/https?:\/\//);
    expect(mailer.sent[0].html).not.toMatch(/https?:\/\//);
  });

  it('does the same work for an existing account (it hashes the password too)', async () => {
    const { hasher, register } = setup();
    const hash = vi.spyOn(hasher, 'hash');

    await register.execute(
      input({ manager: { email: 'existente@iglesia.org' } }),
      null,
    );

    expect(hash).toHaveBeenCalledTimes(1);
  });

  it('treats losing the race for an e-mail like an existing account', async () => {
    const { world, mailer, register } = setup();
    world.raceOnEmail = true;

    const receipt = await register.execute(input(), null);

    expect(receipt).toEqual({
      emailVerificationRequired: true,
      congregationName: 'Monte de Sión Cartagena',
    });
    expect(mailer.sent.map((m) => m.kind)).toEqual(['REGISTRATION_NOTICE']);
  });

  it('rejects a name the denomination already uses whatever the e-mail is, so it cannot probe addresses', async () => {
    const { world, register } = setup();

    for (const email of ['laura@iglesia.org', 'existente@iglesia.org']) {
      await expect(
        register.execute(
          input({
            congregation: { name: ' sede   CENTRAL ' },
            manager: { email },
          }),
          null,
        ),
      ).rejects.toBeInstanceOf(ConflictDomainException);
    }
    expect(world.registrations).toHaveLength(0);
  });

  it('answers 404 for an unknown, inactive or inactive-denomination legal entity', async () => {
    const { world, register } = setup();

    for (const legalEntityId of [999, 13, 32]) {
      await expect(
        register.execute(input({ legalEntityId }), null),
      ).rejects.toBeInstanceOf(NotFoundDomainException);
    }
    expect(world.registrations).toHaveLength(0);
  });

  it('rejects a weak password, an unknown municipality and a short name before anything is written', async () => {
    const { world, mailer, register } = setup();

    const bad = [
      input({ manager: { password: 'corta1' } }),
      input({ manager: { password: 'laura@iglesia.org-2026' } }),
      input({ congregation: { municipalityCode: '99999' } }),
      input({ manager: { displayName: 'Lu' } }),
      input({ congregation: { name: '   ' } }),
    ];
    for (const candidate of bad) {
      await expect(register.execute(candidate, null)).rejects.toBeInstanceOf(
        InvalidInputException,
      );
    }
    expect(world.registrations).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('accepts a registration with only the name and the municipality: address, phone and e-mail are optional', async () => {
    const { world, register } = setup();

    await register.execute(
      input({
        congregation: {
          address: null,
          phone: null,
          email: null,
        },
      }),
      null,
    );

    expect(world.registrations[0].command.congregation).toMatchObject({
      municipalityId: 1,
      address: null,
      phone: null,
      email: null,
    });
  });

  it('requires the municipality', async () => {
    const { world, register } = setup();

    await expect(
      register.execute(
        input({ congregation: { municipalityCode: '  ' } }),
        null,
      ),
    ).rejects.toMatchObject({ code: 'MUNICIPALITY_REQUIRED' });
    expect(world.registrations).toHaveLength(0);
  });

  it('resolves the municipality inside the country of the legal entity, before the e-mail branch', async () => {
    const { world, mailer, register } = setup();

    // 1701 exists, but in another country than the one of the legal entity.
    for (const email of ['laura@iglesia.org', 'existente@iglesia.org']) {
      await expect(
        register.execute(
          input({
            congregation: { municipalityCode: '1701' },
            manager: { email },
          }),
          null,
        ),
      ).rejects.toMatchObject({
        code: 'MUNICIPALITY_COUNTRY_MISMATCH',
        message: 'El municipio no pertenece al país de la razón social.',
      });
    }
    expect(world.registrations).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('is limited per e-mail and closes when the counter store fails', async () => {
    const { world, rateLimit, register } = setup();

    await register.execute(
      input({ manager: { email: ' Laura@Iglesia.org ' } }),
      null,
    );
    expect(rateLimit.calls).toEqual([
      {
        name: 'public-congregation-registration-email',
        identity: 'laura@iglesia.org',
        policy: 'closed',
      },
    ]);

    rateLimit.blocked = true;
    await expect(register.execute(input(), null)).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
    expect(world.registrations).toHaveLength(1);
  });

  describe('devVerificationLink', () => {
    it('is returned only without SMTP and outside production', async () => {
      const dev = setup();
      dev.mailer.isConfigured = false;
      const withLink = await dev.register.execute(input(), null);
      expect(withLink.devVerificationLink).toBe(
        `https://app.test/login/verify-email?token=${tokenOf(dev.mailer.sent[0])}`,
      );

      const production = setup({ exposeDevLinks: false });
      production.mailer.isConfigured = false;
      expect(
        (await production.register.execute(input(), null)).devVerificationLink,
      ).toBeUndefined();

      const smtp = setup();
      expect(
        (await smtp.register.execute(input(), null)).devVerificationLink,
      ).toBeUndefined();
    });

    it('is never returned for an existing account, so it cannot be used to take over an address', async () => {
      const dev = setup();
      dev.mailer.isConfigured = false;

      const receipt = await dev.register.execute(
        input({ manager: { email: 'existente@iglesia.org' } }),
        null,
      );

      expect(receipt).not.toHaveProperty('devVerificationLink');
    });
  });
});

describe('ListPublicLegalEntitiesUseCase', () => {
  it('returns the legal entities with the NIT masked', async () => {
    const world = new InMemoryPublicWorld();
    world.legalEntities = [
      {
        id: 1,
        legalName: 'Corporación Uno',
        tradeName: null,
        taxId: '900.123.456-7',
        denominationId: 1,
        denominationName: 'Denominación Uno',
        countryId: 48,
        countryName: 'Colombia',
      },
    ];

    const [entity] = await new ListPublicLegalEntitiesUseCase(world).execute();

    expect(entity).toEqual({
      id: 1,
      legalName: 'Corporación Uno',
      tradeName: null,
      taxIdMasked: '***.***.**6-7',
      denominationId: 1,
      denominationName: 'Denominación Uno',
      countryId: 48,
      countryName: 'Colombia',
    });
    expect(entity).not.toHaveProperty('taxId');
  });
});

describe('maskTaxId', () => {
  it('shows only the last 3 characters', () => {
    expect(maskTaxId('900.123.456-7')).toBe('***.***.**6-7');
    expect(maskTaxId('12-3')).toBe('*2-3');
    expect(maskTaxId('')).toBe('');
  });
});
