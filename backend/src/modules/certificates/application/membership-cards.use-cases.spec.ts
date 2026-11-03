import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  CENTRAL,
  NORTE,
  buildWorld,
  denominationWideReader,
  secretaryOf,
  seedCard,
  type World,
} from './testing/certificates-test-world.js';

const MEMBER_ANA = 1;
const MEMBER_NORTE = 4;
const MEMBER_UNREGISTERED = 6;
const secretary = secretaryOf(CENTRAL);

const issueCard = (
  world: World,
  overrides: Partial<{
    memberId: number;
    issuedOn: string;
    expiresOn: string;
  }> = {},
  tenant = secretary,
) =>
  world.useCases.issueCard.execute(tenant, {
    memberId: MEMBER_ANA,
    issuedOn: '2026-11-02',
    expiresOn: '2028-11-02',
    ...overrides,
  });

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  throw new Error('Expected the promise to reject');
}

describe('IssueCardUseCase', () => {
  it('issues a card numbered with the code of the sede and the member number', async () => {
    const world = buildWorld();

    const card = await issueCard(world);

    expect(card).toMatchObject({
      memberId: MEMBER_ANA,
      cardNumber: 'SC-0130',
      status: 'VALID',
      daysToExpire: 731,
      congregationName: 'Sede Central',
    });
    expect(world.audit.entries.map((entry) => entry.action)).toEqual([
      'MEMBERSHIP_CARD_ISSUED',
    ]);
  });

  it('refuses a second valid card until the previous one is voided', async () => {
    const world = buildWorld();
    const first = await issueCard(world);

    expect(await codeOf(issueCard(world))).toBe('ACTIVE_CARD_EXISTS');

    await world.useCases.voidCard.execute(secretary, {
      id: first.id,
      reason: 'Carné extraviado por el miembro',
    });
    await expect(issueCard(world)).resolves.toMatchObject({ status: 'VALID' });
  });

  it('requires the expiry after the issue date', async () => {
    const world = buildWorld();

    expect(
      await codeOf(
        issueCard(world, { issuedOn: '2026-11-02', expiresOn: '2026-11-02' }),
      ),
    ).toBe('INVALID_EXPIRY');
    expect(
      await codeOf(
        issueCard(world, { issuedOn: '2026-11-02', expiresOn: '2026-10-01' }),
      ),
    ).toBe('INVALID_EXPIRY');
  });

  it('rejects malformed dates, a future issue date and a card already expired', async () => {
    const world = buildWorld();

    expect(await codeOf(issueCard(world, { issuedOn: '2026-02-30' }))).toBe(
      'INVALID_DATE',
    );
    expect(await codeOf(issueCard(world, { expiresOn: 'mañana' }))).toBe(
      'INVALID_DATE',
    );
    expect(
      await codeOf(
        issueCard(world, { issuedOn: '2026-11-03', expiresOn: '2028-11-03' }),
      ),
    ).toBe('INVALID_DATE');
    expect(
      await codeOf(
        issueCard(world, { issuedOn: '2024-01-01', expiresOn: '2026-10-31' }),
      ),
    ).toBe('INVALID_DATE');
  });

  it('only issues cards to registered, active members of the active sede', async () => {
    const world = buildWorld();

    expect(await codeOf(issueCard(world, { memberId: MEMBER_NORTE }))).toBe(
      'MEMBER_NOT_FOUND',
    );
    expect(await codeOf(issueCard(world, { memberId: 3 }))).toBe(
      'MEMBER_NOT_ACTIVE',
    );
    expect(
      await codeOf(issueCard(world, { memberId: MEMBER_UNREGISTERED })),
    ).toBe('MEMBER_NOT_REGISTERED');
  });

  it('lets the new sede issue a card after an internal transfer and voids the old one', async () => {
    const world = buildWorld();
    // Ana had a card in Sede Norte, then moved to Sede Central (member 1 lives there now).
    const oldCard = seedCard(world, NORTE, MEMBER_ANA, {
      memberNumber: 5,
      expiresOn: '2027-06-30',
    });

    const candidates = await world.useCases.candidates.execute(secretary, {
      paging: { page: 1, pageSize: 10 },
    });
    expect(candidates.items.map((item) => item.memberId)).toContain(MEMBER_ANA);

    const card = await issueCard(world);

    expect(card.cardNumber).toBe('SC-0130');
    expect(oldCard.voidedAt).not.toBeNull();
    expect(oldCard.voidReason).toBe(
      'Reemplazado por un carné de la nueva sede tras el traslado.',
    );
    const north = await world.useCases.listCards.execute(secretaryOf(NORTE), {
      paging: { page: 1, pageSize: 10 },
    });
    expect(north.items.find((item) => item.id === oldCard.id)?.status).toBe(
      'VOIDED',
    );
    expect(world.audit.entries.map((entry) => entry.action)).toEqual([
      'MEMBERSHIP_CARD_VOIDED',
      'MEMBERSHIP_CARD_ISSUED',
    ]);
  });

  it('does not touch the previous cards when saving fails', async () => {
    const world = buildWorld();
    const oldCard = seedCard(world, NORTE, MEMBER_ANA, {
      expiresOn: '2027-06-30',
    });
    const cardsBefore = world.data.cards.length;
    world.audit.record = () => Promise.reject(new Error('audit down'));

    await expect(issueCard(world)).rejects.toThrow('audit down');

    expect(world.data.cards).toHaveLength(cardsBefore);
    expect(oldCard.expiresOn).toBe('2027-06-30');
  });

  it('needs a sede', async () => {
    const world = buildWorld();

    expect(await codeOf(issueCard(world, {}, denominationWideReader()))).toBe(
      'CONGREGATION_SCOPE_REQUIRED',
    );
  });
});

describe('ListCardsUseCase', () => {
  it('computes valid, expiring and expired from today', async () => {
    const world = buildWorld();
    seedCard(world, CENTRAL, MEMBER_ANA, { expiresOn: '2027-11-02' });
    seedCard(world, CENTRAL, 2, { expiresOn: '2026-11-20' });
    seedCard(world, CENTRAL, 3, { expiresOn: '2026-10-31' });
    seedCard(world, CENTRAL, 6, {
      voidedAt: new Date('2026-09-01T00:00:00Z'),
      voidReason: 'Carné extraviado por el miembro',
    });
    const paging = { page: 1, pageSize: 10 };

    const all = await world.useCases.listCards.execute(secretary, { paging });
    const valid = await world.useCases.listCards.execute(secretary, {
      paging,
      status: 'VALID',
    });
    const expiring = await world.useCases.listCards.execute(secretary, {
      paging,
      expiringInDays: 30,
    });
    const summary = await world.useCases.summary.execute(secretary);

    expect(
      Object.fromEntries(all.items.map((c) => [c.memberId, c.status])),
    ).toEqual({
      1: 'VALID',
      2: 'VALID',
      3: 'EXPIRED',
      6: 'VOIDED',
    });
    expect(valid.total).toBe(2);
    expect(expiring.items.map((c) => c.memberId)).toEqual([2]);
    expect(all.items.find((c) => c.memberId === 2)?.daysToExpire).toBe(18);
    expect(all.items.find((c) => c.memberId === 3)?.daysToExpire).toBeNull();
    expect(summary).toMatchObject({
      cardsValid: 2,
      cardsExpiringSoon: 1,
      cardsExpired: 1,
    });
  });

  it('shows the cards of every sede to a denomination scope', async () => {
    const world = buildWorld();
    seedCard(world, CENTRAL, MEMBER_ANA);
    seedCard(world, NORTE, MEMBER_NORTE);

    const page = await world.useCases.listCards.execute(
      denominationWideReader(),
      {
        paging: { page: 1, pageSize: 10 },
      },
    );

    expect(page.total).toBe(2);
  });
});

describe('ListCardCandidatesUseCase', () => {
  it('lists registered active members without a valid card, flagging the expired ones', async () => {
    const world = buildWorld();
    seedCard(world, CENTRAL, MEMBER_ANA);
    seedCard(world, CENTRAL, 2, { expiresOn: '2026-10-01' });

    const page = await world.useCases.candidates.execute(secretary, {
      paging: { page: 1, pageSize: 10 },
    });

    // 1 has a valid card; 3 is inactive; 6 has no registry number.
    expect(page.items).toEqual([
      {
        memberId: 2,
        fullName: 'Miembro 2',
        cardNumber: 'SC-0131',
        hasExpiredCard: true,
      },
    ]);
  });

  it('never offers members of another sede or denomination', async () => {
    const world = buildWorld();

    const page = await world.useCases.candidates.execute(secretary, {
      paging: { page: 1, pageSize: 10 },
    });

    expect(page.items.map((item) => item.memberId).sort()).toEqual([1, 2]);
  });
});

describe('VoidCardUseCase', () => {
  it('requires a reason and cannot void twice or void an expired card', async () => {
    const world = buildWorld();
    const card = await issueCard(world);
    const expired = seedCard(world, CENTRAL, 2, { expiresOn: '2026-10-01' });

    expect(
      await codeOf(
        world.useCases.voidCard.execute(secretary, {
          id: card.id,
          reason: 'corto',
        }),
      ),
    ).toBe('VOID_REASON_REQUIRED');
    const voided = await world.useCases.voidCard.execute(secretary, {
      id: card.id,
      reason: 'Carné extraviado por el miembro',
    });
    expect(voided).toMatchObject({
      status: 'VOIDED',
      voidReason: 'Carné extraviado por el miembro',
      daysToExpire: null,
    });
    expect(
      await codeOf(
        world.useCases.voidCard.execute(secretary, {
          id: card.id,
          reason: 'Carné extraviado por el miembro',
        }),
      ),
    ).toBe('CARD_ALREADY_VOIDED');
    expect(
      await codeOf(
        world.useCases.voidCard.execute(secretary, {
          id: expired.id,
          reason: 'Carné extraviado por el miembro',
        }),
      ),
    ).toBe('CARD_NOT_VALID');
  });

  it('needs a sede', async () => {
    const world = buildWorld();
    const card = await issueCard(world);

    expect(
      await codeOf(
        world.useCases.voidCard.execute(denominationWideReader(), {
          id: card.id,
          reason: 'Carné extraviado por el miembro',
        }),
      ),
    ).toBe('CONGREGATION_SCOPE_REQUIRED');
    expect(
      await codeOf(
        world.useCases.voidCard.execute(
          buildTenantContext({ kind: 'PLATFORM' }),
          {
            id: card.id,
            reason: 'Carné extraviado por el miembro',
          },
        ),
      ),
    ).toBe('PLATFORM_SCOPE_NOT_ALLOWED');
  });
});
