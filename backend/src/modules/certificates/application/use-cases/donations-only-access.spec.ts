import { NotFoundDomainException } from '../../../../common/errors/domain.exception.js';
import { buildTenantContext } from '../../../../../test/support/tenants.js';
import { CertificateErrorCode } from '../certificate-errors.js';
import {
  CENTRAL,
  DON_TYPE_ID,
  buildWorld,
  type World,
} from '../testing/certificates-test-world.js';

/** The pastor issues everything; the treasurer only the donations certificate. */
const pastor = buildTenantContext({
  denominationId: CENTRAL.denominationId,
  congregationId: CENTRAL.congregationId,
  permissions: ['certificates.issue', 'contributions.read'],
});
const treasurer = buildTenantContext({
  denominationId: CENTRAL.denominationId,
  congregationId: CENTRAL.congregationId,
  permissions: ['contributions.read', 'donation-certificates.issue'],
  userId: 8,
});
const MEMBER_ANA = 1;
const MEM = 1;
const PAGING = { page: 1, pageSize: 50 };
const FILTER = { sort: 'issuedOn:desc' } as const;

/** One membership certificate and one donations certificate, both issued by the pastor. */
async function worldWithBoth() {
  const world = buildWorld();
  world.data.donations.push({
    memberId: MEMBER_ANA,
    concept: 'Diezmo',
    receivedOn: '2025-05-05',
    amountCents: 300_000_00,
  });
  const membership = await world.useCases.issue.execute(pastor, {
    memberId: MEMBER_ANA,
    certificateTypeId: MEM,
    notes: null,
  });
  const donations = await world.useCases.issue.execute(pastor, {
    memberId: MEMBER_ANA,
    certificateTypeId: DON_TYPE_ID,
    notes: null,
    fiscalYear: 2025,
  });
  return { world, membership, donations };
}

const codeOf = (error: unknown) => (error as { code: string }).code;

async function failure(run: () => Promise<unknown>): Promise<unknown> {
  return run().then(
    () => null,
    (error: unknown) => error,
  );
}

describe('the treasury, with the donations permission only', () => {
  it('issues the donations certificate', async () => {
    const world = buildWorld();
    world.data.donations.push({
      memberId: MEMBER_ANA,
      concept: 'Diezmo',
      receivedOn: '2025-05-05',
      amountCents: 300_000_00,
    });

    const issued = await world.useCases.issue.execute(treasurer, {
      memberId: MEMBER_ANA,
      certificateTypeId: DON_TYPE_ID,
      notes: null,
      fiscalYear: 2025,
    });

    expect(issued.number).toBe('CERT-DON-2026-0001');
    expect(issued.typeCode).toBe('DON');
  });

  it('cannot preview or issue any other type, which looks like a type that does not exist', async () => {
    const world = buildWorld();

    for (const run of [
      () =>
        world.useCases.preview.execute(treasurer, {
          memberId: MEMBER_ANA,
          certificateTypeId: MEM,
          notes: null,
        }),
      () =>
        world.useCases.issue.execute(treasurer, {
          memberId: MEMBER_ANA,
          certificateTypeId: MEM,
          notes: null,
        }),
    ]) {
      const error = await failure(run);
      expect(error).toBeInstanceOf(NotFoundDomainException);
      expect(codeOf(error)).toBe(
        CertificateErrorCode.CERTIFICATE_TYPE_NOT_FOUND,
      );
    }
    expect(world.data.certificates).toHaveLength(0);
  });

  it('is offered the donations type only, in the issue form and in the catalog', async () => {
    const world = buildWorld();

    const context = await world.useCases.issuingContext.execute(treasurer);
    const catalog = await world.useCases.types.execute(treasurer);

    expect(context.types.map((type) => type.code)).toEqual(['DON']);
    expect(context.types[0].nextNumber).toBe('CERT-DON-2026-0001');
    expect(catalog.map((type) => type.code)).toEqual(['DON']);
  });

  it('lists only the donations certificates, even when it asks for another type', async () => {
    const { world, donations } = await worldWithBoth();

    for (const typeCode of [undefined, 'MEM', 'DON']) {
      const page = await world.useCases.list.execute(treasurer, {
        filter: { ...FILTER, typeCode },
        paging: PAGING,
      });
      expect(page.items.map((item) => item.id)).toEqual([donations.id]);
    }
    const asPastor = await world.useCases.list.execute(pastor, {
      filter: FILTER,
      paging: PAGING,
    });
    expect(asPastor.items).toHaveLength(2);
  });

  it('exports only the donations certificates', async () => {
    const { world, donations } = await worldWithBoth();

    const csv = await world.useCases.exportCsv.execute(treasurer, FILTER);

    expect(csv.content).toContain(donations.number);
    expect(csv.content).not.toContain('CERT-MEM-');
  });

  it('opens, prints and voids a donations certificate', async () => {
    const { world, donations } = await worldWithBoth();

    await expect(
      world.useCases.get.execute(treasurer, donations.id),
    ).resolves.toMatchObject({ typeCode: 'DON' });
    await expect(
      world.useCases.pdf.execute(treasurer, donations.id),
    ).resolves.toMatchObject({ filename: `${donations.number}.pdf` });
    await expect(
      world.useCases.void.execute(treasurer, {
        id: donations.id,
        reason: 'Se emitió para el año equivocado',
      }),
    ).resolves.toMatchObject({ status: 'VOIDED' });
  });

  it('cannot open, print or void a certificate of another type: it looks like it does not exist', async () => {
    const { world, membership } = await worldWithBoth();

    for (const run of [
      () => world.useCases.get.execute(treasurer, membership.id),
      () => world.useCases.pdf.execute(treasurer, membership.id),
      () =>
        world.useCases.void.execute(treasurer, {
          id: membership.id,
          reason: 'Intento de anular un certificado ajeno',
        }),
    ]) {
      const error = await failure(run);
      expect(error).toBeInstanceOf(NotFoundDomainException);
      expect(codeOf(error)).toBe(CertificateErrorCode.CERTIFICATE_NOT_FOUND);
    }
    const stored = world.data.certificates.find((c) => c.id === membership.id);
    expect(stored?.voidedAt).toBeNull();
  });

  it('counts only the donations certificates, and shows nothing about the membership cards', async () => {
    const { world } = await worldWithBoth();
    await seedValidCard(world);

    const summary = await world.useCases.summary.execute(treasurer);
    const full = await world.useCases.summary.execute(pastor);

    expect(summary).toMatchObject({
      issued: 1,
      voided: 0,
      cardsValid: 0,
      cardsExpiringSoon: 0,
      cardsExpired: 0,
    });
    expect(full.issued).toBe(2);
    expect(full.cardsValid).toBe(1);
  });
});

async function seedValidCard(world: World) {
  await world.useCases.issueCard.execute(pastor, {
    memberId: MEMBER_ANA,
    issuedOn: '2026-11-02',
    expiresOn: '2028-11-02',
  });
}

describe('a user with the general permission as well', () => {
  it('keeps seeing every type, whatever the donations permission says', async () => {
    const world = buildWorld();
    const both = buildTenantContext({
      denominationId: CENTRAL.denominationId,
      congregationId: CENTRAL.congregationId,
      permissions: ['certificates.issue', 'donation-certificates.issue'],
    });

    const context = await world.useCases.issuingContext.execute(both);

    expect(context.types.map((type) => type.code)).toEqual([
      'MEM',
      'TRA',
      'BAU',
      'ASI',
      'DON',
    ]);
  });
});
