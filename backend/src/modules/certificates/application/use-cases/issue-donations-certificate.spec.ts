import {
  BusinessRuleException,
  ForbiddenDomainException,
  InvalidInputException,
} from '../../../../common/errors/domain.exception.js';
import { buildTenantContext } from '../../../../../test/support/tenants.js';
import { CertificateErrorCode } from '../certificate-errors.js';
import {
  CENTRAL,
  DON_TYPE_ID,
  buildWorld,
  secretaryOf,
  type World,
} from '../testing/certificates-test-world.js';

/** A pastor: issues certificates and may read the contributions. */
const pastor = buildTenantContext({
  denominationId: CENTRAL.denominationId,
  congregationId: CENTRAL.congregationId,
  permissions: ['certificates.issue', 'contributions.read'],
});
const MEMBER_ANA = 1;

function give(
  world: World,
  concept: string,
  receivedOn: string,
  pesos: number,
) {
  world.data.donations.push({
    memberId: MEMBER_ANA,
    concept,
    receivedOn,
    amountCents: pesos * 100,
  });
}

function issue(world: World, fiscalYear: number | null, tenant = pastor) {
  return world.useCases.issue.execute(tenant, {
    memberId: MEMBER_ANA,
    certificateTypeId: DON_TYPE_ID,
    notes: null,
    fiscalYear,
  });
}

function code(error: unknown): string {
  return (error as { code: string }).code;
}

describe('issuing a donations certificate', () => {
  it('adds up the recorded contributions of the year and stores them in the snapshot', async () => {
    const world = buildWorld();
    give(world, 'Diezmo', '2025-02-02', 400_000);
    give(world, 'Diezmo', '2025-08-10', 600_000);
    give(world, 'Ofrenda', '2025-12-31', 250_000);
    give(world, 'Diezmo', '2024-12-31', 999_999);
    give(world, 'Diezmo', '2026-01-01', 999_999);

    const issued = await issue(world, 2025);

    expect(issued.number).toBe('CERT-DON-2026-0001');
    const { snapshot } = world.data.certificates.find(
      (c) => c.id === issued.id,
    )!;
    expect(snapshot.donation).toMatchObject({
      fiscalYear: 2025,
      periodFrom: '2025-01-01',
      periodTo: '2025-12-31',
      receipts: 3,
      total: '$1.250.000',
      totalInWords: 'un millón doscientos cincuenta mil pesos colombianos',
    });
    expect(snapshot.donation?.lines).toEqual([
      { concept: 'Diezmo', receipts: 2, amount: '$1.000.000' },
      { concept: 'Ofrenda', receipts: 1, amount: '$250.000' },
    ]);
    expect(world.data.donationQueries).toEqual([
      { memberId: MEMBER_ANA, from: '2025-01-01', to: '2025-12-31' },
    ]);
  });

  it('counts the current year only up to today', async () => {
    const world = buildWorld();
    give(world, 'Diezmo', '2026-03-01', 100_000);
    give(world, 'Diezmo', '2026-11-02', 50_000);
    give(world, 'Diezmo', '2026-11-03', 999_999);

    const issued = await issue(world, 2026);

    expect(world.data.donationQueries.at(-1)).toMatchObject({
      from: '2026-01-01',
      to: '2026-11-02',
    });
    const { snapshot } = world.data.certificates.find(
      (c) => c.id === issued.id,
    )!;
    expect(snapshot.donation?.total).toBe('$150.000');
    expect(snapshot.donation?.periodTo).toBe('2026-11-02');
  });

  it('shows the same figures in the preview, without taking a number', async () => {
    const world = buildWorld();
    give(world, 'Diezmo', '2025-05-05', 300_000);

    const preview = await world.useCases.preview.execute(pastor, {
      memberId: MEMBER_ANA,
      certificateTypeId: DON_TYPE_ID,
      notes: null,
      fiscalYear: 2025,
    });

    expect(preview.snapshot.number).toBe('CERT-DON-2026-0001');
    expect(preview.snapshot.donation?.total).toBe('$300.000');
    expect(world.data.certificates).toHaveLength(0);
  });

  it('needs the permission to read contributions too: the secretary cannot issue it', async () => {
    const world = buildWorld();
    give(world, 'Diezmo', '2025-05-05', 300_000);

    const failure = await issue(world, 2025, secretaryOf(CENTRAL)).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ForbiddenDomainException);
    expect(code(failure)).toBe(
      CertificateErrorCode.DONATION_CERTIFICATE_FORBIDDEN,
    );
    expect(world.data.donationQueries).toHaveLength(0);
  });

  it('checks the permission before it reads anything about the member', async () => {
    const world = buildWorld();

    const failure = await world.useCases.issue
      .execute(secretaryOf(CENTRAL), {
        memberId: 9999,
        certificateTypeId: DON_TYPE_ID,
        notes: null,
        fiscalYear: 2025,
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ForbiddenDomainException);
  });

  it.each([null, 1999, 2027, 2025.5])(
    'rejects the fiscal year %s',
    async (year) => {
      const world = buildWorld();
      give(world, 'Diezmo', '2025-05-05', 300_000);

      const failure = await issue(world, year).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(InvalidInputException);
      expect(code(failure)).toBe(CertificateErrorCode.FISCAL_YEAR_INVALID);
    },
  );

  it('refuses a year without contributions and does not use up a number', async () => {
    const world = buildWorld();
    give(world, 'Diezmo', '2024-05-05', 300_000);

    const failure = await issue(world, 2025).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BusinessRuleException);
    expect(code(failure)).toBe(CertificateErrorCode.NO_DONATIONS_IN_PERIOD);
    expect(world.data.certificates).toHaveLength(0);
    give(world, 'Diezmo', '2025-05-05', 300_000);
    await expect(issue(world, 2025)).resolves.toMatchObject({
      number: 'CERT-DON-2026-0001',
    });
  });

  it('does not read contributions for the other types, even if a year comes in', async () => {
    const world = buildWorld();

    await world.useCases.issue.execute(pastor, {
      memberId: MEMBER_ANA,
      certificateTypeId: 1,
      notes: null,
      fiscalYear: 2025,
    });

    expect(world.data.donationQueries).toHaveLength(0);
  });

  it('can be voided like any other certificate', async () => {
    const world = buildWorld();
    give(world, 'Diezmo', '2025-05-05', 300_000);
    const issued = await issue(world, 2025);

    const voided = await world.useCases.void.execute(pastor, {
      id: issued.id,
      reason: 'Se emitió para el año equivocado',
    });

    expect(voided.status).toBe('VOIDED');
  });
});
