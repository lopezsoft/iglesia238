import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import {
  FixedClock,
  ImmediateTransactionRunner,
  RecordingAuditRecorder,
} from '../../../../test/support/foundation-fakes.js';
import {
  TENANT_A_WIDE,
  buildTenantContext,
} from '../../../../test/support/tenants.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import {
  CreatePrivacyPolicyUseCase,
  DeletePrivacyPolicyUseCase,
  ListPrivacyPoliciesUseCase,
  PublishPrivacyPolicyUseCase,
  UpdatePrivacyPolicyUseCase,
} from './privacy-policies.use-cases.js';
import { InMemoryPrivacyPolicies } from './testing/in-memory-policies.js';

const TEXT =
  'Tratamos tus datos personales conforme a la Ley 1581 de 2012. '.repeat(2);
const DRAFT = { version: '2.0', content: TEXT, effectiveFrom: '2026-12-01' };

function contextOf(scope: TenantScope) {
  return buildTenantContext({
    kind: 'DENOMINATION',
    denominationId: scope.denominationId,
    congregationId: null,
  });
}

function setup() {
  const repository = new InMemoryPrivacyPolicies();
  const transactions = new ImmediateTransactionRunner();
  const audit = new RecordingAuditRecorder();
  const clock = new FixedClock(); // 2026-11-02 in Bogota
  return {
    repository,
    audit,
    list: new ListPrivacyPoliciesUseCase(repository, clock),
    create: new CreatePrivacyPolicyUseCase(
      repository,
      transactions,
      audit,
      clock,
    ),
    update: new UpdatePrivacyPolicyUseCase(
      repository,
      transactions,
      audit,
      clock,
    ),
    remove: new DeletePrivacyPolicyUseCase(repository, transactions, audit),
    publish: new PublishPrivacyPolicyUseCase(
      repository,
      transactions,
      audit,
      clock,
    ),
  };
}

const ADMIN = contextOf(TENANT_A_WIDE);

describe('ListPrivacyPoliciesUseCase', () => {
  it('marks the current policy and tells when the public form is closed', async () => {
    const { repository, list } = setup();
    expect((await list.execute(ADMIN)).hasCurrentPolicy).toBe(false);

    repository.seed({
      denominationId: 1,
      version: '1.0',
      status: 'PUBLISHED',
      effectiveFrom: '2025-01-01',
      publishedAt: new Date(),
    });
    repository.seed({
      denominationId: 1,
      version: '2.0',
      status: 'PUBLISHED',
      effectiveFrom: '2026-10-01',
      publishedAt: new Date(),
    });
    repository.seed({
      denominationId: 1,
      version: '3.0',
      status: 'PUBLISHED',
      effectiveFrom: '2027-01-01',
      publishedAt: new Date(),
    });
    repository.seed({ denominationId: 1, version: '4.0-borrador' });

    const result = await list.execute(ADMIN);

    expect(result.hasCurrentPolicy).toBe(true);
    // Newest effective date first.
    expect(result.items.map((item) => [item.version, item.state])).toEqual([
      ['3.0', 'SCHEDULED'],
      ['2.0', 'CURRENT'],
      ['4.0-borrador', 'DRAFT'],
      ['1.0', 'SUPERSEDED'],
    ]);
  });

  it('never lists the policies of another denomination', async () => {
    const { repository, list } = setup();
    repository.seed({ denominationId: 2, version: 'x' });

    expect((await list.execute(ADMIN)).items).toHaveLength(0);
  });

  it('is not available in the platform scope', async () => {
    const { list } = setup();

    await expect(
      list.execute(buildTenantContext({ kind: 'PLATFORM' })),
    ).rejects.toMatchObject({
      code: 'PLATFORM_SCOPE_NOT_ALLOWED',
    });
  });
});

describe('CreatePrivacyPolicyUseCase', () => {
  it('creates a draft that the public cannot see yet', async () => {
    const { create, audit } = setup();

    const view = await create.execute(ADMIN, DRAFT, '10.0.0.1');

    expect(view).toMatchObject({
      version: '2.0',
      status: 'DRAFT',
      state: 'DRAFT',
      isCurrent: false,
    });
    expect(audit.entries[0]).toMatchObject({
      action: 'POLICY_CREATED',
      entity: 'PrivacyPolicy',
      changes: { status: { from: null, to: 'DRAFT' } },
    });
    expect(JSON.stringify(audit.entries[0].changes)).not.toContain('Ley 1581');
  });

  it('refuses a repeated version in the same denomination only', async () => {
    const { create, repository } = setup();
    repository.seed({ denominationId: 1, version: '2.0' });
    repository.seed({ denominationId: 2, version: '9.0' });

    await expect(create.execute(ADMIN, DRAFT, null)).rejects.toMatchObject({
      code: 'POLICY_VERSION_EXISTS',
    });
    await expect(
      create.execute(ADMIN, { ...DRAFT, version: '9.0' }, null),
    ).resolves.toBeDefined();
  });

  it.each([
    [{ ...DRAFT, version: '   ' }],
    [{ ...DRAFT, version: 'v'.repeat(21) }],
    [{ ...DRAFT, content: 'corto' }],
    [{ ...DRAFT, effectiveFrom: '2026-02-30' }],
  ])('validates the draft %#', async (input) => {
    const { create } = setup();

    await expect(create.execute(ADMIN, input, null)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('UpdatePrivacyPolicyUseCase', () => {
  let ctx = setup();
  beforeEach(() => {
    ctx = setup();
  });

  describeCrossTenantIsolation('update privacy policy', {
    congregationLevel: false,
    arrange: (owner) =>
      ctx.repository.seed({ denominationId: owner.denominationId }).id,
    act: (scope, id) => ctx.update.execute(contextOf(scope), id, DRAFT, null),
  });

  it('edits a draft', async () => {
    const { id } = ctx.repository.seed({ denominationId: 1, version: '1.0' });

    const view = await ctx.update.execute(ADMIN, id, DRAFT, null);

    expect(view).toMatchObject({ version: '2.0', effectiveFrom: '2026-12-01' });
  });

  it('keeps its own version without complaining', async () => {
    const { id } = ctx.repository.seed({ denominationId: 1, version: '2.0' });

    await expect(
      ctx.update.execute(ADMIN, id, DRAFT, null),
    ).resolves.toBeDefined();
  });

  it('does not touch a published policy', async () => {
    const { id } = ctx.repository.seed({
      denominationId: 1,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    });

    await expect(
      ctx.update.execute(ADMIN, id, DRAFT, null),
    ).rejects.toMatchObject({
      code: 'POLICY_NOT_EDITABLE',
    });
  });
});

describe('DeletePrivacyPolicyUseCase', () => {
  let ctx = setup();
  beforeEach(() => {
    ctx = setup();
  });

  describeCrossTenantIsolation('delete privacy policy', {
    congregationLevel: false,
    arrange: (owner) =>
      ctx.repository.seed({ denominationId: owner.denominationId }).id,
    act: (scope, id) => ctx.remove.execute(contextOf(scope), id, null),
  });

  it('deletes a draft and audits it', async () => {
    const { id } = ctx.repository.seed({ denominationId: 1 });

    await ctx.remove.execute(ADMIN, id, null);

    expect(ctx.repository.rows).toHaveLength(0);
    expect(ctx.audit.entries[0].action).toBe('POLICY_DELETED');
  });

  it('refuses to delete a published policy', async () => {
    const { id } = ctx.repository.seed({
      denominationId: 1,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    });

    await expect(ctx.remove.execute(ADMIN, id, null)).rejects.toMatchObject({
      code: 'POLICY_NOT_EDITABLE',
    });
  });
});

describe('PublishPrivacyPolicyUseCase', () => {
  let ctx = setup();
  beforeEach(() => {
    ctx = setup();
  });

  describeCrossTenantIsolation('publish privacy policy', {
    congregationLevel: false,
    arrange: (owner) =>
      ctx.repository.seed({ denominationId: owner.denominationId }).id,
    act: (scope, id) => ctx.publish.execute(contextOf(scope), id, null),
  });

  it('publishes a draft that takes effect today when its date already passed', async () => {
    const { id } = ctx.repository.seed({
      denominationId: 1,
      effectiveFrom: '2026-01-01',
    });

    const view = await ctx.publish.execute(ADMIN, id, '10.0.0.1');

    expect(view).toMatchObject({
      status: 'PUBLISHED',
      state: 'CURRENT',
      isCurrent: true,
      effectiveFrom: '2026-11-02',
    });
    expect(view.publishedAt).toBe('2026-11-02T15:00:00.000Z');
    expect(ctx.audit.entries[0]).toMatchObject({
      action: 'POLICY_PUBLISHED',
      changes: {
        status: { from: 'DRAFT', to: 'PUBLISHED' },
        effectiveFrom: { from: '2026-01-01', to: '2026-11-02' },
      },
    });
  });

  it('schedules a policy whose date is in the future', async () => {
    const { id } = ctx.repository.seed({
      denominationId: 1,
      effectiveFrom: '2027-01-01',
    });

    const view = await ctx.publish.execute(ADMIN, id, null);

    expect(view.state).toBe('SCHEDULED');
  });

  it('refuses a date earlier than another published policy', async () => {
    ctx.repository.seed({
      denominationId: 1,
      version: '1.0',
      status: 'PUBLISHED',
      effectiveFrom: '2027-01-01',
      publishedAt: new Date(),
    });
    const { id } = ctx.repository.seed({
      denominationId: 1,
      version: '2.0',
      effectiveFrom: '2026-12-01',
    });

    await expect(ctx.publish.execute(ADMIN, id, null)).rejects.toMatchObject({
      code: 'POLICY_EFFECTIVE_DATE_OUTDATED',
    });
    expect(ctx.repository.rows.find((row) => row.id === id)?.status).toBe(
      'DRAFT',
    );
  });

  it('does not publish twice', async () => {
    const { id } = ctx.repository.seed({ denominationId: 1 });
    await ctx.publish.execute(ADMIN, id, null);

    await expect(ctx.publish.execute(ADMIN, id, null)).rejects.toMatchObject({
      code: 'POLICY_ALREADY_PUBLISHED',
    });
  });
});
