import {
  InvalidInputException,
  NotFoundDomainException,
} from '../../../../common/errors/domain.exception.js';
import { buildTenantContext } from '../../../../../test/support/tenants.js';
import { TEMPLATE_PLACEHOLDERS } from '../certificate-document.js';
import {
  CENTRAL,
  buildWorld,
  secretaryOf,
} from '../testing/certificates-test-world.js';

/** The administrator of denomination 1: manages the types for every sede. */
const admin = buildTenantContext({
  kind: 'DENOMINATION',
  denominationId: 1,
  permissions: ['certificate-types.manage'],
});
const MEM = 1;
const secretary = secretaryOf(CENTRAL);

describe('certificate type templates', () => {
  it('lists the types of the denomination with the placeholders and the default texts', async () => {
    const world = buildWorld();

    const catalog = await world.useCases.listTemplates.execute(admin);

    expect(catalog.types.map((type) => type.code)).toEqual([
      'MEM',
      'TRA',
      'BAU',
      'ASI',
      'DON',
    ]);
    expect(catalog.placeholders.map((p) => p.key)).toEqual([
      ...TEMPLATE_PLACEHOLDERS,
    ]);
    expect(catalog.defaults.intro).toContain('{{sede}}');
    expect(catalog.types[0]).toMatchObject({
      template: null,
      introTemplate: null,
    });
  });

  it('saves the customized texts and audits the change without personal data', async () => {
    const world = buildWorld();

    const updated = await world.useCases.updateType.execute(
      admin,
      MEM,
      { introTemplate: 'La {{denomination}} certifica que', validityDays: 365 },
      '10.0.0.1',
    );

    expect(updated).toMatchObject({
      id: MEM,
      introTemplate: 'La {{denomination}} certifica que',
      validityDays: 365,
    });
    expect(world.audit.entries).toHaveLength(1);
    expect(world.audit.entries[0]).toMatchObject({
      action: 'CERTIFICATE_TYPE_UPDATED',
      entity: 'CertificateType',
      entityId: MEM,
      ipAddress: '10.0.0.1',
    });
    expect(world.audit.entries[0].changes).toEqual({
      introText: { from: null, to: 'La {{denomination}} certifica que' },
      validityDays: { from: null, to: 365 },
    });
  });

  it('does nothing, and audits nothing, when the values are the same', async () => {
    const world = buildWorld();
    await world.useCases.updateType.execute(admin, MEM, {
      closingTemplate: 'Dado en {{city}}.',
    });
    world.audit.entries.length = 0;

    const again = await world.useCases.updateType.execute(admin, MEM, {
      closingTemplate: '  Dado en {{city}}.  ',
    });

    expect(again.closingTemplate).toBe('Dado en {{city}}.');
    expect(world.audit.entries).toHaveLength(0);
  });

  it('clears a text with null or a blank string, which brings back the default', async () => {
    const world = buildWorld();
    await world.useCases.updateType.execute(admin, MEM, {
      introTemplate: 'Hace constar',
      closingTemplate: 'Dado en {{city}}.',
    });

    const cleared = await world.useCases.updateType.execute(admin, MEM, {
      introTemplate: null,
      closingTemplate: '   ',
    });

    expect(cleared).toMatchObject({
      introTemplate: null,
      closingTemplate: null,
    });
  });

  it('rejects an invalid text and saves nothing', async () => {
    const world = buildWorld();

    await expect(
      world.useCases.updateType.execute(admin, MEM, {
        name: 'Nuevo nombre',
        introTemplate: 'Hola {{nope}}',
      }),
    ).rejects.toBeInstanceOf(InvalidInputException);

    const catalog = await world.useCases.listTemplates.execute(admin);
    expect(catalog.types[0].name).toBe('Certificado de membresía');
    expect(world.audit.entries).toHaveLength(0);
  });

  it('answers 404 for a type of another denomination', async () => {
    const world = buildWorld();
    const otherAdmin = buildTenantContext({
      kind: 'DENOMINATION',
      denominationId: 2,
      permissions: ['certificate-types.manage'],
    });

    // Type 1 belongs to denomination 1: denomination 2 must not see or edit it.
    await expect(
      world.useCases.updateType.execute(otherAdmin, MEM, {
        introTemplate: 'Intruso',
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      world.useCases.previewTemplate.execute(otherAdmin, MEM, {}),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(
      (await world.useCases.listTemplates.execute(otherAdmin)).types.map(
        (type) => type.id,
      ),
    ).not.toContain(MEM);
  });

  it('keeps the text of the certificates already issued and uses the new one from now on', async () => {
    const world = buildWorld();
    const before = await world.useCases.issue.execute(secretary, {
      memberId: 1,
      certificateTypeId: MEM,
      notes: null,
    });

    await world.useCases.updateType.execute(admin, MEM, {
      introTemplate: 'La Iglesia certifica que',
      pastorTitleTemplate: 'Pastor titular',
    });
    const after = await world.useCases.issue.execute(secretary, {
      memberId: 1,
      certificateTypeId: MEM,
      notes: null,
    });

    const snapshotOf = (id: number) =>
      world.data.certificates.find((c) => c.id === id)!.snapshot;
    expect(snapshotOf(before.id).intro).toBe(
      'La Secretaría de la Sede Central hace constar',
    );
    expect(snapshotOf(before.id).pastorTitle).toBe('Pastor(a), Sede Central');
    expect(snapshotOf(after.id).intro).toBe('La Iglesia certifica que');
    expect(snapshotOf(after.id).pastorTitle).toBe('Pastor titular');
  });

  it('previews a sample certificate with the texts being edited, without saving them', async () => {
    const world = buildWorld();

    const preview = await world.useCases.previewTemplate.execute(admin, MEM, {
      introTemplate: 'La {{denomination}} certifica que',
      template: '{{memberName}} es miembro de {{sede}}.',
    });

    expect(preview.title).toBe('CERTIFICADO DE MEMBRESÍA');
    expect(preview.intro).toBe('La Su denominación certifica que');
    expect(preview.body).toBe(
      'María Fernanda Pérez Gómez es miembro de la Sede Central.',
    );
    expect(preview.closing).toContain('2 de noviembre de 2026');
    const saved = (await world.useCases.listTemplates.execute(admin)).types[0];
    expect(saved.introTemplate).toBeNull();
    expect(world.audit.entries).toHaveLength(0);
  });

  it('refuses to preview a text that would not be accepted on save', async () => {
    const world = buildWorld();

    await expect(
      world.useCases.previewTemplate.execute(admin, MEM, {
        closingTemplate: 'Dado en {{ciudad}}',
      }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });
});
