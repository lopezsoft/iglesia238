import { NotFoundDomainException } from '../../../../common/errors/domain.exception.js';
import {
  CENTRAL,
  buildWorld,
  secretaryOf,
} from '../testing/certificates-test-world.js';
import { CertificateErrorCode } from '../certificate-errors.js';

const secretary = secretaryOf(CENTRAL);

async function issued() {
  const world = buildWorld();
  const certificate = await world.useCases.issue.execute(secretary, {
    memberId: 1,
    certificateTypeId: 1,
    notes: null,
  });
  return { world, id: certificate.id };
}

describe('VerifyCertificateUseCase', () => {
  it('confirms a valid certificate with the holder masked', async () => {
    const { world, id } = await issued();

    const view = await world.useCases.verify.execute(`${id}.sig`);

    expect(view).toMatchObject({
      status: 'VALID',
      verifiedOn: '2026-11-02',
      issuedOn: '2026-11-02',
    });
    expect(view.number).toMatch(/^CERT-MEM-2026-\d{4}$/);
    expect(view.holderName).toMatch(/^\S+( \S\.)+$/);
  });

  it('never exposes the full name, the document or the member code', async () => {
    const { world, id } = await issued();
    const stored = world.data.certificates.find((c) => c.id === id)!;

    const json = JSON.stringify(
      await world.useCases.verify.execute(`${id}.sig`),
    );

    expect(json).not.toContain(stored.snapshot.memberName);
    expect(json).not.toContain(stored.snapshot.memberCode);
    expect(json).not.toContain(stored.snapshot.taxId);
  });

  it('reports a voided certificate as voided', async () => {
    const { world, id } = await issued();
    await world.useCases.void.execute(secretary, {
      id,
      reason: 'Error en el nombre del miembro',
    });

    await expect(
      world.useCases.verify.execute(`${id}.sig`),
    ).resolves.toMatchObject({ status: 'VOIDED' });
  });

  it('reports an expired certificate as expired', async () => {
    const { world, id } = await issued();
    world.data.certificates.find((c) => c.id === id)!.expiresOn = '2026-11-01';

    await expect(
      world.useCases.verify.execute(`${id}.sig`),
    ).resolves.toMatchObject({ status: 'EXPIRED' });
  });

  it('answers the same for a bad signature, a malformed token and an unknown certificate', async () => {
    const { world } = await issued();

    for (const token of ['1.forged', 'not-a-token', '', '999999.sig']) {
      const failure = await world.useCases.verify
        .execute(token)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(NotFoundDomainException);
      expect(failure).toMatchObject({
        code: CertificateErrorCode.CERTIFICATE_NOT_VERIFIABLE,
      });
    }
  });

  it('prints the verification link on the PDF of an issued certificate', async () => {
    const { world, id } = await issued();

    await world.useCases.pdf.execute(secretary, id);

    expect(world.renderer.certificates.at(-1)?.verificationUrl).toBe(
      `https://app.test/verify-certificate?t=${id}.sig`,
    );
  });
});
