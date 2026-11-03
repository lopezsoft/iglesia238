import { buildTenantContext } from '../../../../test/support/tenants.js';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import {
  CENTRAL,
  buildWorld,
  seedCard,
} from './testing/certificates-test-world.js';

/** A secretary acting in the congregation of the tenant scope under test. */
function actingIn(
  scope: Pick<TenantScope, 'denominationId' | 'congregationId'>,
) {
  return buildTenantContext({
    denominationId: scope.denominationId,
    congregationId: scope.congregationId,
    permissions: ['certificates.issue'],
  });
}

/**
 * Data of tenant A lives in the world; tenant B (another denomination) and the sibling sede of A
 * must get 404 for every resource, whatever the operation.
 */
/** MEM of the denomination of the acting tenant: type 1 in denomination 1, type 5 in denomination 2. */
const memTypeOf = (scope: Pick<TenantScope, 'denominationId'>) =>
  scope.denominationId === 2 ? 5 : 1;

describeCrossTenantIsolation('GetCertificateUseCase', {
  arrange: async () => {
    const world = buildWorld();
    const issued = await world.useCases.issue.execute(
      buildTenantContext({ permissions: ['certificates.issue'] }),
      { memberId: 1, certificateTypeId: 1, notes: null },
    );
    return { world, id: issued.id };
  },
  act: (scope, { world, id }) =>
    world.useCases.get.execute(actingIn(scope), id),
});

describeCrossTenantIsolation('VoidCertificateUseCase', {
  arrange: async () => {
    const world = buildWorld();
    const issued = await world.useCases.issue.execute(
      buildTenantContext({ permissions: ['certificates.issue'] }),
      { memberId: 1, certificateTypeId: 1, notes: null },
    );
    return { world, id: issued.id };
  },
  act: (scope, { world, id }) =>
    world.useCases.void.execute(actingIn(scope), {
      id,
      reason: 'Error en el nombre del miembro',
    }),
});

describeCrossTenantIsolation('RenderCertificatePdfUseCase', {
  arrange: async () => {
    const world = buildWorld();
    const issued = await world.useCases.issue.execute(
      buildTenantContext({ permissions: ['certificates.issue'] }),
      { memberId: 1, certificateTypeId: 1, notes: null },
    );
    return { world, id: issued.id };
  },
  act: (scope, { world, id }) =>
    world.useCases.pdf.execute(actingIn(scope), id),
});

describeCrossTenantIsolation('IssueCertificateUseCase (member of tenant A)', {
  arrange: () => ({ world: buildWorld(), memberId: 1 }),
  act: (scope, { world, memberId }) =>
    world.useCases.issue.execute(actingIn(scope), {
      memberId,
      // The type of the acting denomination, so only the member can fail.
      certificateTypeId: memTypeOf(scope),
      notes: null,
    }),
});

describeCrossTenantIsolation('PreviewCertificateUseCase (member of tenant A)', {
  arrange: () => ({ world: buildWorld(), memberId: 1 }),
  act: (scope, { world, memberId }) =>
    world.useCases.preview.execute(actingIn(scope), {
      memberId,
      certificateTypeId: memTypeOf(scope),
      notes: null,
    }),
});

describeCrossTenantIsolation('FindCertificateMemberUseCase', {
  arrange: () => ({ world: buildWorld(), memberId: 1 }),
  act: (scope, { world, memberId }) =>
    world.useCases.findMember.execute(actingIn(scope), memberId),
});

describeCrossTenantIsolation('IssueCardUseCase (member of tenant A)', {
  arrange: () => ({ world: buildWorld(), memberId: 1 }),
  act: (scope, { world, memberId }) =>
    world.useCases.issueCard.execute(actingIn(scope), {
      memberId,
      issuedOn: '2026-11-02',
      expiresOn: '2028-11-02',
    }),
});

describeCrossTenantIsolation('VoidCardUseCase', {
  arrange: () => {
    const world = buildWorld();
    const card = seedCard(world, CENTRAL, 1);
    return { world, id: card.id };
  },
  act: (scope, { world, id }) =>
    world.useCases.voidCard.execute(actingIn(scope), {
      id,
      reason: 'Carné extraviado por el miembro',
    }),
});

describeCrossTenantIsolation('RenderCardPdfUseCase', {
  arrange: () => {
    const world = buildWorld();
    const card = seedCard(world, CENTRAL, 1);
    return { world, id: card.id };
  },
  act: (scope, { world, id }) =>
    world.useCases.cardPdf.execute(actingIn(scope), id),
});

describe('lists never mix tenants', () => {
  it('certificates, cards and candidates only show the rows of the acting sede', async () => {
    const world = buildWorld();
    await world.useCases.issue.execute(
      buildTenantContext({ permissions: ['certificates.issue'] }),
      { memberId: 1, certificateTypeId: 1, notes: null },
    );
    seedCard(world, CENTRAL, 1);

    for (const scope of [
      { denominationId: 2, congregationId: 20 },
      { denominationId: 1, congregationId: 11 },
    ]) {
      const tenant = actingIn(scope);
      const paging = { page: 1, pageSize: 10 };
      const certificates = await world.useCases.list.execute(tenant, {
        filter: { sort: 'issuedOn:desc' },
        paging,
      });
      const cards = await world.useCases.listCards.execute(tenant, { paging });
      const summary = await world.useCases.summary.execute(tenant);

      expect(certificates.total).toBe(0);
      expect(cards.total).toBe(0);
      expect(summary).toMatchObject({ issued: 0, cardsValid: 0 });
    }
  });
});
