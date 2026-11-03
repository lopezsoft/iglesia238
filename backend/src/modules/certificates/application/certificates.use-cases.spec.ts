import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  CENTRAL,
  NORTE,
  buildWorld,
  denominationWideReader,
  secretaryOf,
  type World,
} from './testing/certificates-test-world.js';

const MEMBER_ANA = 1;
const MEMBER_NOT_BAPTIZED = 2;
const MEMBER_INACTIVE = 3;
const MEMBER_NORTE = 4;
const TYPE = { MEM: 1, TRA: 2, BAU: 3, ASI: 4 } as const;

const secretary = secretaryOf(CENTRAL);

function issue(
  world: World,
  overrides: Partial<{
    memberId: number;
    certificateTypeId: number;
    notes: string | null;
  }> = {},
  tenant = secretary,
) {
  return world.useCases.issue.execute(tenant, {
    memberId: MEMBER_ANA,
    certificateTypeId: TYPE.MEM,
    notes: null,
    ...overrides,
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  throw new Error('Expected the promise to reject');
}

describe('IssueCertificateUseCase', () => {
  it('numbers each series of the sede without gaps', async () => {
    const world = buildWorld();

    const first = await issue(world);
    const second = await issue(world);
    const baptism = await issue(world, { certificateTypeId: TYPE.BAU });

    expect([first.number, second.number, baptism.number]).toEqual([
      'CERT-MEM-2026-0001',
      'CERT-MEM-2026-0002',
      'CERT-BAU-2026-0001',
    ]);
  });

  it('keeps a separate series per sede', async () => {
    const world = buildWorld();
    await issue(world);

    const north = await issue(
      world,
      { memberId: MEMBER_NORTE },
      secretaryOf(NORTE),
    );

    expect(north.number).toBe('CERT-MEM-2026-0001');
  });

  it('does not restart the counter in a new year, only the printed year changes', async () => {
    const world = buildWorld();
    await issue(world);
    world.clock.set('2027-01-04T15:00:00.000Z');

    const next = await issue(world);

    expect(next.number).toBe('CERT-MEM-2027-0002');
  });

  it('does not consume a number when the request is rejected', async () => {
    const world = buildWorld();

    await expect(
      issue(world, { memberId: MEMBER_NORTE }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    const issued = await issue(world);

    expect(issued.number).toBe('CERT-MEM-2026-0001');
  });

  it('releases the number when saving fails after it was taken', async () => {
    const world = buildWorld();
    const original = world.audit.record.bind(world.audit);
    world.audit.record = () => Promise.reject(new Error('audit down'));

    await expect(issue(world)).rejects.toThrow('audit down');
    world.audit.record = original;
    const issued = await issue(world);

    expect(issued.number).toBe('CERT-MEM-2026-0001');
    expect(world.data.certificates).toHaveLength(1);
  });

  it('only issues to active members of the active sede', async () => {
    const world = buildWorld();

    expect(await codeOf(issue(world, { memberId: MEMBER_NORTE }))).toBe(
      'MEMBER_NOT_FOUND',
    );
    expect(await codeOf(issue(world, { memberId: MEMBER_INACTIVE }))).toBe(
      'MEMBER_NOT_ACTIVE',
    );
    expect(await codeOf(issue(world, { memberId: 999 }))).toBe(
      'MEMBER_NOT_FOUND',
    );
  });

  it('rejects an unknown certificate type', async () => {
    const world = buildWorld();

    expect(await codeOf(issue(world, { certificateTypeId: 999 }))).toBe(
      'CERTIFICATE_TYPE_NOT_FOUND',
    );
  });

  it('requires a registered baptism for the baptism certificate', async () => {
    const world = buildWorld();

    const error = await issue(world, {
      memberId: MEMBER_NOT_BAPTIZED,
      certificateTypeId: TYPE.BAU,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BusinessRuleException);
    expect((error as BusinessRuleException).code).toBe('MEMBER_NOT_BAPTIZED');
    await expect(
      issue(world, {
        memberId: MEMBER_NOT_BAPTIZED,
        certificateTypeId: TYPE.MEM,
      }),
    ).resolves.toMatchObject({ typeCode: 'MEM' });
  });

  it('rejects notes longer than 255 characters', async () => {
    const world = buildWorld();

    const error = await issue(world, { notes: 'x'.repeat(256) }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(InvalidInputException);
    expect((error as InvalidInputException).code).toBe('NOTES_TOO_LONG');
  });

  it('refuses to issue when the sede has no current pastor', async () => {
    const world = buildWorld();
    world.data.signers.set(10, {
      pastor: null,
      secretary: { personId: null, name: 'Marta Castillo' },
    });

    expect(await codeOf(issue(world))).toBe('PASTOR_REQUIRED');
    expect(world.data.certificates).toHaveLength(0);
  });

  it('keeps the printed snapshot, with the full document, whatever happens to the member later', async () => {
    const world = buildWorld();
    const issued = await issue(world, { notes: 'Para trámite de visa' });

    world.data.members.find((m) => m.id === MEMBER_ANA)!.fullName =
      'Otro nombre';
    const detail = await world.useCases.get.execute(secretary, issued.id);

    expect(detail.snapshot.memberName).toBe('Ana María Rojas Díaz');
    expect(detail.snapshot.body).toContain('CC 52.418.911');
    expect(detail.snapshot.notes).toBe('Para trámite de visa');
    expect(detail.snapshot.number).toBe(detail.number);
    expect(detail.snapshot.pastorName).toBe('Pastor Sede Central');
  });

  it('computes the expiry from the validity days of the type', async () => {
    const world = buildWorld();

    const letter = await issue(world, { certificateTypeId: TYPE.TRA });
    const membership = await issue(world);

    expect(letter.expiresOn).toBe('2027-01-31');
    expect(membership.expiresOn).toBeNull();
  });

  it('records the issue in the audit log without personal data', async () => {
    const world = buildWorld();

    const issued = await issue(world, { notes: 'Para trámite de visa' });

    expect(world.audit.entries).toHaveLength(1);
    const [entry] = world.audit.entries;
    expect(entry).toMatchObject({
      action: 'CERTIFICATE_ISSUED',
      entity: 'Certificate',
      entityId: issued.id,
      congregationId: 10,
    });
    expect(JSON.stringify(entry.changes)).not.toContain('Ana');
    expect(entry.changes).toEqual({
      number: { from: null, to: 'CERT-MEM-2026-0001' },
      typeCode: { from: null, to: 'MEM' },
    });
  });

  it('asks for a sede when the scope is the whole denomination', async () => {
    const world = buildWorld();

    expect(await codeOf(issue(world, {}, denominationWideReader()))).toBe(
      'CONGREGATION_SCOPE_REQUIRED',
    );
  });

  it('refuses the platform scope', async () => {
    const world = buildWorld();

    expect(
      await codeOf(issue(world, {}, buildTenantContext({ kind: 'PLATFORM' }))),
    ).toBe('PLATFORM_SCOPE_NOT_ALLOWED');
  });
});

describe('PreviewCertificateUseCase', () => {
  it('shows the next number without reserving it', async () => {
    const world = buildWorld();
    await issue(world);

    const preview = await world.useCases.preview.execute(secretary, {
      memberId: MEMBER_ANA,
      certificateTypeId: TYPE.MEM,
      notes: null,
    });
    const again = await world.useCases.preview.execute(secretary, {
      memberId: MEMBER_ANA,
      certificateTypeId: TYPE.MEM,
      notes: null,
    });
    const issued = await issue(world);

    expect(preview.snapshot.number).toBe('CERT-MEM-2026-0002');
    expect(again.snapshot.number).toBe('CERT-MEM-2026-0002');
    expect(issued.number).toBe('CERT-MEM-2026-0002');
    expect(preview.warnings).toEqual([]);
  });

  it('warns that it cannot be issued when there is no pastor', async () => {
    const world = buildWorld();
    world.data.signers.set(10, { pastor: null, secretary: null });

    const preview = await world.useCases.preview.execute(secretary, {
      memberId: MEMBER_ANA,
      certificateTypeId: TYPE.MEM,
      notes: null,
    });

    expect(preview.warnings).toHaveLength(1);
    expect(preview.snapshot.pastorName).toBe('Pastor(a) de la sede');
  });
});

describe('GetIssuingContextUseCase', () => {
  it('continues each series of the sede and shows the next number', async () => {
    const world = buildWorld();
    await issue(world);
    await issue(world);

    const context = await world.useCases.issuingContext.execute(secretary);

    expect(context.congregationId).toBe(10);
    expect(context.today).toBe('2026-11-02');
    expect(context.year).toBe(2026);
    expect(context.signers.pastorName).toBe('Pastor Sede Central');
    expect(context.letterhead.congregationName).toBe('Sede Central');
    expect(context.types.map((type) => type.nextNumber)).toEqual([
      'CERT-MEM-2026-0003',
      'CERT-TRA-2026-0001',
      'CERT-BAU-2026-0001',
      'CERT-ASI-2026-0001',
    ]);
  });

  it('uses the Bogota calendar day, not the UTC one', async () => {
    const world = buildWorld();
    // 03:30 UTC of 3 November is still 2 November in Bogota.
    world.clock.set('2026-11-03T03:30:00.000Z');

    const context = await world.useCases.issuingContext.execute(secretary);

    expect(context.today).toBe('2026-11-02');
  });
});

describe('ListCertificatesUseCase', () => {
  async function populated() {
    const world = buildWorld();
    await issue(world);
    await issue(world, { certificateTypeId: TYPE.BAU });
    await issue(world, { memberId: MEMBER_NORTE }, secretaryOf(NORTE));
    return world;
  }

  const paging = { page: 1, pageSize: 10 };
  const sort = 'issuedOn:desc' as const;

  it('lists only the certificates of the active sede', async () => {
    const world = await populated();

    const page = await world.useCases.list.execute(secretary, {
      filter: { sort },
      paging,
    });

    expect(page.total).toBe(2);
    expect(page.items.every((item) => item.congregationId === 10)).toBe(true);
  });

  it('lets a denomination scope read every sede and narrow to one', async () => {
    const world = await populated();
    const reader = denominationWideReader();

    const all = await world.useCases.list.execute(reader, {
      filter: { sort },
      paging,
    });
    const north = await world.useCases.list.execute(reader, {
      filter: { sort },
      paging,
      congregationId: 11,
    });

    expect(all.total).toBe(3);
    expect(north.items.map((item) => item.congregationName)).toEqual([
      'Sede Norte',
    ]);
  });

  it('never reaches a sede of another denomination, even when asked for it', async () => {
    const world = await populated();

    await expect(
      world.useCases.list.execute(denominationWideReader(), {
        filter: { sort },
        paging,
        congregationId: 20,
      }),
    ).resolves.toMatchObject({ total: 0 });
  });

  it('filters by type and status and paginates on the server', async () => {
    const world = await populated();
    const bau = await world.useCases.list.execute(secretary, {
      filter: { sort, typeCode: 'BAU' },
      paging,
    });
    await world.useCases.void.execute(secretary, {
      id: bau.items[0].id,
      reason: 'Error en el nombre del miembro',
    });

    const voided = await world.useCases.list.execute(secretary, {
      filter: { sort, status: 'VOIDED' },
      paging,
    });
    const firstPage = await world.useCases.list.execute(secretary, {
      filter: { sort },
      paging: { page: 1, pageSize: 1 },
    });

    expect(bau.total).toBe(1);
    expect(voided.items.map((item) => item.typeCode)).toEqual(['BAU']);
    expect(firstPage).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(firstPage.items).toHaveLength(1);
  });
});

describe('VoidCertificateUseCase', () => {
  it('requires a reason, keeps the number and cannot void twice', async () => {
    const world = buildWorld();
    const issued = await issue(world);

    expect(
      await codeOf(
        world.useCases.void.execute(secretary, {
          id: issued.id,
          reason: ' corto ',
        }),
      ),
    ).toBe('VOID_REASON_REQUIRED');

    const voided = await world.useCases.void.execute(secretary, {
      id: issued.id,
      reason: '  Error en el nombre del miembro  ',
    });
    expect(voided).toMatchObject({
      status: 'VOIDED',
      number: issued.number,
      voidReason: 'Error en el nombre del miembro',
    });
    expect(voided.voidedAt).not.toBeNull();

    const again = await world.useCases.void
      .execute(secretary, {
        id: issued.id,
        reason: 'Error en el nombre del miembro',
      })
      .catch((e: unknown) => e);
    expect(again).toBeInstanceOf(ConflictDomainException);
    expect((again as ConflictDomainException).code).toBe(
      'CERTIFICATE_ALREADY_VOIDED',
    );

    // The number is not reused: the next one keeps counting.
    expect((await issue(world)).number).toBe('CERT-MEM-2026-0002');
    expect(world.audit.entries.map((entry) => entry.action)).toEqual([
      'CERTIFICATE_ISSUED',
      'CERTIFICATE_VOIDED',
      'CERTIFICATE_ISSUED',
    ]);
  });

  it('refuses a reason longer than 255 characters', async () => {
    const world = buildWorld();
    const issued = await issue(world);

    expect(
      await codeOf(
        world.useCases.void.execute(secretary, {
          id: issued.id,
          reason: 'x'.repeat(256),
        }),
      ),
    ).toBe('VOID_REASON_REQUIRED');
  });

  it('needs a sede, like issuing', async () => {
    const world = buildWorld();
    const issued = await issue(world);

    expect(
      await codeOf(
        world.useCases.void.execute(denominationWideReader(), {
          id: issued.id,
          reason: 'Error en el nombre del miembro',
        }),
      ),
    ).toBe('CONGREGATION_SCOPE_REQUIRED');
  });
});

describe('summary', () => {
  it('counts the year, voided ones included, and the cards by state', async () => {
    const world = buildWorld();
    const first = await issue(world);
    await issue(world);
    await world.useCases.void.execute(secretary, {
      id: first.id,
      reason: 'Error en el nombre del miembro',
    });
    world.data.certificates[0].issuedOn = '2025-12-31';

    const summary = await world.useCases.summary.execute(secretary);

    expect(summary).toMatchObject({
      year: 2026,
      issued: 1,
      voided: 0,
      cardsValid: 0,
      cardsExpiringSoon: 0,
      cardsExpired: 0,
    });
  });
});

describe('member options', () => {
  it('searches active members of the sede and always masks the document', async () => {
    const world = buildWorld();

    const byName = await world.useCases.searchMembers.execute(
      secretary,
      'rojas',
    );
    const byCode = await world.useCases.searchMembers.execute(
      secretary,
      'SC-0131',
    );
    const tooShort = await world.useCases.searchMembers.execute(secretary, 'a');

    expect(byName.map((option) => option.id)).toEqual([MEMBER_ANA]);
    expect(byCode.map((option) => option.id)).toEqual([MEMBER_NOT_BAPTIZED]);
    expect(byName[0].documentLabel).toBe('CC ····8911');
    expect(JSON.stringify(byName)).not.toContain('52418911');
    expect(tooShort).toEqual([]);
  });

  it('never lists inactive members or members of another sede', async () => {
    const world = buildWorld();

    const found = await world.useCases.searchMembers.execute(
      secretary,
      'Miembro',
    );

    expect(found.map((option) => option.id).sort()).toEqual([2, 6]);
  });

  it('finds one member and refuses the inactive ones', async () => {
    const world = buildWorld();

    await expect(
      world.useCases.findMember.execute(secretary, MEMBER_ANA),
    ).resolves.toMatchObject({ id: MEMBER_ANA, isBaptized: true });
    expect(
      await codeOf(
        world.useCases.findMember.execute(secretary, MEMBER_INACTIVE),
      ),
    ).toBe('MEMBER_NOT_ACTIVE');
    expect(
      await codeOf(world.useCases.findMember.execute(secretary, MEMBER_NORTE)),
    ).toBe('MEMBER_NOT_FOUND');
  });
});

describe('certificate types', () => {
  it('lists the types of the denomination also in a denomination scope', async () => {
    const world = buildWorld();

    const types = await world.useCases.types.execute(denominationWideReader());

    expect(types.map((type) => type.code)).toEqual([
      'MEM',
      'TRA',
      'BAU',
      'ASI',
    ]);
    expect(types.find((type) => type.code === 'TRA')?.validityDays).toBe(90);
  });
});

describe('ExportCertificatesUseCase', () => {
  it('exports the filtered list as CSV with BOM and neutralized formulas', async () => {
    const world = buildWorld();
    await issue(world);
    world.data.members.find((m) => m.id === MEMBER_ANA)!.fullName = '=cmd';
    const second = await issue(world);
    world.data.certificates.find((c) => c.id === second.id)!.snapshot = {
      ...world.data.certificates[1].snapshot,
      memberName: '=cmd',
    };

    const file = await world.useCases.exportCsv.execute(secretary, {
      sort: 'issuedOn:asc',
    });

    expect(file.filename).toBe('certificados.csv');
    expect(file.content.startsWith('﻿')).toBe(true);
    const lines = file.content.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Número;Tipo;Sede');
    expect(lines[2]).toContain("'=cmd");
  });
});
