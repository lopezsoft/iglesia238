import {
  FixedClock,
  ImmediateTransactionRunner,
  RecordingAuditRecorder,
} from '../../../../test/support/foundation-fakes.js';
import { SmartLogger } from '../../../common/logging/smart-logger.service.js';
import {
  hashTrackingCode,
  TRACKING_CODE_PATTERN,
} from '../../membership-applications/domain/tracking-code.js';
import {
  CheckApplicationStatusUseCase,
  GetCurrentPolicyUseCase,
  ListOpenCongregationsUseCase,
} from './public-reads.use-cases.js';
import {
  SubmitApplicationUseCase,
  type SubmitApplicationInput,
} from './submit-application.use-case.js';
import { InMemoryPublicWorld } from './testing/in-memory-public.js';

const ADULT: SubmitApplicationInput = {
  congregationId: 10,
  policyId: 5,
  firstName: 'Ana',
  lastName: 'Pérez',
  secondLastName: 'Gómez',
  documentTypeCode: 'CC',
  documentNumber: '1023456789',
  birthDate: '1990-05-20',
  sex: 'FEMALE',
  maritalStatusCode: 'SINGLE',
  phone: '3001234567',
  email: 'ana@example.com',
  address: 'Calle 1 # 2-3',
  municipalityCode: '13001',
  neighborhood: 'Centro',
  occupation: null,
  previousCongregationName: null,
  isBaptized: null,
  guardian: null,
  consentAccepted: true,
  website: null,
};

const GUARDIAN = {
  firstName: 'Marta',
  lastName: 'Ruiz',
  documentTypeCode: 'CC',
  documentNumber: '52.345.678'.replace(/\./g, ''),
  relationship: 'Madre',
  phone: '3009999999',
};

function setup() {
  const world = new InMemoryPublicWorld();
  const audit = new RecordingAuditRecorder();
  const clock = new FixedClock(); // 2026-11-02 in Bogota
  const logger = {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
  } as unknown as SmartLogger;
  return {
    world,
    audit,
    logger,
    submit: new SubmitApplicationUseCase(
      world,
      world,
      new ImmediateTransactionRunner(),
      audit,
      clock,
      logger,
    ),
    status: new CheckApplicationStatusUseCase(world),
    policy: new GetCurrentPolicyUseCase(world, clock),
    congregations: new ListOpenCongregationsUseCase(world, clock),
  };
}

describe('SubmitApplicationUseCase', () => {
  it('stores a PENDING application of the denomination of the chosen sede and returns the code once', async () => {
    const { world, submit } = setup();

    const { trackingCode } = await submit.execute(
      { ...ADULT, documentNumber: 'ab123' },
      '10.0.0.1',
    );

    expect(trackingCode).toMatch(TRACKING_CODE_PATTERN);
    expect(world.applications).toHaveLength(1);
    expect(world.applications[0]).toMatchObject({
      denominationId: 1,
      congregationId: 10,
      policyId: 5,
      status: 'PENDING',
      documentNumber: 'AB123',
      trackingCodeHash: hashTrackingCode(trackingCode),
    });
    // Only the hash is stored, never the code.
    expect(JSON.stringify(world.applications)).not.toContain(trackingCode);
    expect(world.applications[0].formData).toMatchObject({
      secondLastName: 'Gómez',
      sex: 'FEMALE',
      municipalityCode: '13001',
      neighborhood: 'Centro',
      guardian: null,
    });
  });

  it('audits the submission with the IP and no personal data', async () => {
    const { audit, submit } = setup();

    await submit.execute(ADULT, '10.0.0.1');

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'APPLICATION_SUBMITTED',
      entity: 'MembershipApplication',
      actor: { userId: null, denominationId: 1, congregationId: 10 },
      ipAddress: '10.0.0.1',
      changes: { status: { from: null, to: 'PENDING' } },
    });
    expect(JSON.stringify(audit.entries[0])).not.toContain('1023456789');
  });

  it('answers like a success to a bot and stores nothing', async () => {
    const { world, audit, submit } = setup();

    const receipt = await submit.execute(
      { ...ADULT, website: 'http://spam.example' },
      null,
    );

    expect(receipt.trackingCode).toMatch(TRACKING_CODE_PATTERN);
    expect(world.applications).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('requires the consent', async () => {
    const { world, submit } = setup();

    await expect(
      submit.execute({ ...ADULT, consentAccepted: false }, null),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(world.applications).toHaveLength(0);
  });

  it('refuses a sede that is closed or does not exist', async () => {
    const { submit } = setup();

    await expect(
      submit.execute({ ...ADULT, congregationId: 11 }, null),
    ).rejects.toMatchObject({
      code: 'CONGREGATION_CLOSED',
    });
    await expect(
      submit.execute({ ...ADULT, congregationId: 999 }, null),
    ).rejects.toMatchObject({
      code: 'CONGREGATION_CLOSED',
    });
  });

  describe('tenant isolation', () => {
    it('refuses the policy of another denomination: the consent is for the policy of the sede', async () => {
      const { world, submit } = setup();

      await expect(
        submit.execute({ ...ADULT, congregationId: 10, policyId: 6 }, null),
      ).rejects.toMatchObject({ code: 'POLICY_OUTDATED' });
      expect(world.applications).toHaveLength(0);
    });

    it('takes the denomination from the sede, whatever the client says', async () => {
      const { world, submit } = setup();

      await submit.execute({ ...ADULT, congregationId: 20, policyId: 6 }, null);

      expect(world.applications[0]).toMatchObject({
        denominationId: 2,
        congregationId: 20,
      });
    });
  });

  it('refuses an outdated policy and a denomination without a policy', async () => {
    const { world, submit } = setup();
    await expect(
      submit.execute({ ...ADULT, policyId: 4 }, null),
    ).rejects.toMatchObject({
      code: 'POLICY_OUTDATED',
    });

    world.policies = [];
    await expect(submit.execute(ADULT, null)).rejects.toMatchObject({
      code: 'POLICY_NOT_AVAILABLE',
    });
  });

  it.each([
    ['2026-11-03', 'future'],
    ['1900-01-01', 'too old'],
    ['2026-02-30', 'not a calendar day'],
  ])('refuses the birth date %s (%s)', async (birthDate) => {
    const { submit } = setup();

    await expect(
      submit.execute({ ...ADULT, birthDate }, null),
    ).rejects.toMatchObject({
      code: 'INVALID_BIRTH_DATE',
    });
  });

  it('requires a guardian for a minor and keeps it normalized', async () => {
    const { world, submit } = setup();
    const minor = { ...ADULT, birthDate: '2014-03-10' };

    await expect(submit.execute(minor, null)).rejects.toMatchObject({
      code: 'GUARDIAN_REQUIRED',
    });

    await submit.execute(
      { ...minor, guardian: { ...GUARDIAN, documentNumber: 'cc5234' } },
      null,
    );
    expect(world.applications[0]).toMatchObject({
      guardianName: 'Marta Ruiz',
      guardianDocument: 'CC5234',
    });
    expect(world.applications[0].formData.guardian).toMatchObject({
      relationship: 'Madre',
      documentTypeCode: 'CC',
    });
  });

  it('turns 18 today: no guardian is needed and the data sent is dropped', async () => {
    const { world, submit } = setup();

    await submit.execute(
      { ...ADULT, birthDate: '2008-11-02', guardian: GUARDIAN },
      null,
    );

    expect(world.applications[0].guardianName).toBeNull();
    expect(world.applications[0].formData.guardian).toBeNull();
  });

  it.each([
    [{ documentTypeCode: 'XX' }],
    [{ maritalStatusCode: 'NOPE' }],
    [{ municipalityCode: '99999' }],
  ])('refuses values outside the catalogs %#', async (override) => {
    const { submit } = setup();

    await expect(
      submit.execute({ ...ADULT, ...override }, null),
    ).rejects.toMatchObject({
      code: 'INVALID_CATALOG_VALUE',
    });
  });

  it('draws another code when it collides with an existing hash', async () => {
    const { world, submit } = setup();
    let first = true;
    const original = world.trackingHashExists.bind(world);
    world.trackingHashExists = (hash: string) => {
      if (first) {
        first = false;
        return Promise.resolve(true);
      }
      return original(hash);
    };

    const { trackingCode } = await submit.execute(ADULT, null);

    expect(world.applications[0].trackingCodeHash).toBe(
      hashTrackingCode(trackingCode),
    );
  });
});

describe('CheckApplicationStatusUseCase', () => {
  async function submitted() {
    const ctx = setup();
    const { trackingCode } = await ctx.submit.execute(ADULT, null);
    return { ...ctx, trackingCode };
  }

  it('shows the status and the dates, without personal data', async () => {
    const { status, trackingCode } = await submitted();

    const view = await status.execute(` ${trackingCode.toLowerCase()} `);

    expect(view).toEqual({
      status: 'PENDING',
      statusLabel: 'Pendiente',
      submittedOn: '2026-11-02T15:00:00.000Z',
      reviewedOn: null,
      notice: null,
    });
  });

  it('shows a duplicate as in review', async () => {
    const { world, status, trackingCode } = await submitted();
    world.applications[0].status = 'DUPLICATE';
    world.applications[0].reviewedAt = new Date('2026-11-03T15:00:00.000Z');

    const view = await status.execute(trackingCode);

    expect(view).toMatchObject({
      status: 'IN_REVIEW',
      statusLabel: 'En revisión',
      reviewedOn: null,
    });
  });

  it('shows a generic notice for a rejection and never the reason', async () => {
    const { world, status, trackingCode } = await submitted();
    world.applications[0].status = 'REJECTED';
    world.applications[0].reviewedAt = new Date('2026-11-03T15:00:00.000Z');
    (
      world.applications[0] as unknown as Record<string, unknown>
    ).rejectionReason = 'Motivo interno secreto';

    const view = await status.execute(trackingCode);

    expect(view.status).toBe('REJECTED');
    expect(view.reviewedOn).toBe('2026-11-03T15:00:00.000Z');
    expect(view.notice).toContain('no fue aprobada');
    expect(JSON.stringify(view)).not.toContain('secreto');
    expect(Object.keys(view).sort()).toEqual([
      'notice',
      'reviewedOn',
      'status',
      'statusLabel',
      'submittedOn',
    ]);
  });

  it('answers the same to an unknown code and to a malformed one', async () => {
    const { status } = await submitted();

    const unknown = await status
      .execute('IG-AAAA-BBBB')
      .catch((error: unknown) => error);
    const malformed = await status
      .execute('hola')
      .catch((error: unknown) => error);

    expect(unknown).toMatchObject({
      code: 'NOT_FOUND',
      message: 'No encontramos una solicitud con ese código.',
    });
    expect(malformed).toMatchObject({
      code: 'NOT_FOUND',
      message: 'No encontramos una solicitud con ese código.',
    });
  });
});

describe('public reads', () => {
  it('lists only the sedes that are open and have a policy', async () => {
    const { congregations, world } = setup();

    expect((await congregations.execute()).map((c) => c.id)).toEqual([10, 20]);

    world.policies = world.policies.filter(
      (policy) => policy.denominationId === 2,
    );
    expect((await congregations.execute()).map((c) => c.id)).toEqual([20]);
  });

  it('serves the policy of a denomination and 404 when it has none', async () => {
    const { policy, world } = setup();

    expect((await policy.execute(1)).id).toBe(5);
    expect((await policy.execute(2)).id).toBe(6);
    world.policies = [];
    await expect(policy.execute(1)).rejects.toMatchObject({
      code: 'POLICY_NOT_AVAILABLE',
    });
  });
});
