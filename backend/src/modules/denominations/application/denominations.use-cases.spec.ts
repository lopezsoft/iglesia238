import {
  ConflictDomainException,
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  FixedClock,
  ImmediateTransactionRunner,
  RecordingAuditRecorder,
} from '../../../../test/support/foundation-fakes.js';
import { CreateDenominationUseCase } from './create-denomination.use-case.js';
import {
  DENOMINATION_TEMPLATE,
  type DenominationTemplate,
} from './denomination-template.js';
import type {
  DenominationCounts,
  DenominationListFilter,
  DenominationProvisioner,
  DenominationRecord,
  DenominationRepository,
} from './denomination.repository.port.js';
import {
  GetDenominationStatsUseCase,
  ListDenominationsUseCase,
} from './list-denominations.use-case.js';
import {
  RenameDenominationUseCase,
  SetDenominationStatusUseCase,
} from './update-denomination.use-case.js';

class FakeDenominationRepository implements DenominationRepository {
  readonly rows: DenominationRecord[] = [];
  private nextId = 1;

  seed(name: string, isActive = true): DenominationRecord {
    const row: DenominationRecord = {
      id: this.nextId++,
      name,
      isActive,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      legalEntityCount: 0,
      congregationCount: 0,
    };
    this.rows.push(row);
    return row;
  }

  list(filter: DenominationListFilter) {
    const items = this.rows.filter(
      (row) =>
        row.name.toLowerCase().includes(filter.search.toLowerCase()) &&
        (filter.status === 'all' ||
          row.isActive === (filter.status === 'active')),
    );
    const start = (filter.page - 1) * filter.pageSize;
    return Promise.resolve({
      items: items.slice(start, start + filter.pageSize),
      total: items.length,
    });
  }

  counts(): Promise<DenominationCounts> {
    return Promise.resolve({
      total: this.rows.length,
      active: this.rows.filter((row) => row.isActive).length,
      congregations: 0,
    });
  }

  findById(id: number) {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  listNames() {
    return Promise.resolve(this.rows.map(({ id, name }) => ({ id, name })));
  }

  create(name: string) {
    return Promise.resolve(this.seed(name).id);
  }

  rename(id: number, name: string) {
    this.replace(id, { name });
    return Promise.resolve();
  }

  setActive(id: number, isActive: boolean) {
    this.replace(id, { isActive });
    return Promise.resolve();
  }

  private replace(id: number, change: Partial<DenominationRecord>): void {
    const index = this.rows.findIndex((row) => row.id === id);
    this.rows[index] = { ...this.rows[index], ...change };
  }
}

class FakeProvisioner implements DenominationProvisioner {
  provisioned: {
    denominationId: number;
    template: DenominationTemplate;
    policyEffectiveFrom: string;
  }[] = [];
  failWith: Error | null = null;

  provision(
    denominationId: number,
    template: DenominationTemplate,
    policyEffectiveFrom: string,
  ) {
    if (this.failWith) {
      return Promise.reject(this.failWith);
    }
    this.provisioned.push({ denominationId, template, policyEffectiveFrom });
    return Promise.resolve();
  }
}

const platform = buildTenantContext({ kind: 'PLATFORM', userId: 1 });
const tenant = buildTenantContext({ kind: 'DENOMINATION', denominationId: 1 });

function build() {
  const repository = new FakeDenominationRepository();
  const provisioner = new FakeProvisioner();
  const audit = new RecordingAuditRecorder();
  const transactions = new ImmediateTransactionRunner();
  return {
    repository,
    provisioner,
    audit,
    create: new CreateDenominationUseCase(
      repository,
      provisioner,
      transactions,
      audit,
      new FixedClock(),
    ),
    rename: new RenameDenominationUseCase(repository, transactions, audit),
    setStatus: new SetDenominationStatusUseCase(
      repository,
      transactions,
      audit,
    ),
    list: new ListDenominationsUseCase(repository),
    stats: new GetDenominationStatsUseCase(repository),
  };
}

describe('CreateDenominationUseCase', () => {
  it('creates the denomination, provisions the template with the date of today and audits it', async () => {
    const { create, provisioner, audit } = build();

    const result = await create.execute({
      context: platform,
      name: '  Iglesia   Cristiana  Monte de Sión ',
      ipAddress: '10.0.0.1',
    });

    expect(result).toMatchObject({
      name: 'Iglesia Cristiana Monte de Sión',
      isActive: true,
    });
    expect(provisioner.provisioned).toEqual([
      {
        denominationId: result.id,
        template: DENOMINATION_TEMPLATE,
        policyEffectiveFrom: '2026-11-02',
      },
    ]);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'CREATE',
      entity: 'Denomination',
      entityId: result.id,
      denominationId: result.id,
      ipAddress: '10.0.0.1',
      changes: { name: { from: null, to: result.name } },
    });
  });

  it('rejects an empty name and a name that is too long', async () => {
    const { create } = build();

    await expect(
      create.execute({ context: platform, name: '   ', ipAddress: null }),
    ).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
    await expect(
      create.execute({
        context: platform,
        name: 'x'.repeat(201),
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ code: 'NAME_TOO_LONG' });
  });

  it('rejects a duplicate name ignoring case and accents', async () => {
    const { create, repository } = build();
    repository.seed('Iglesia Cristiana Sión');

    await expect(
      create.execute({
        context: platform,
        name: 'iglesia cristiana sion',
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_NAME' });
    await expect(
      create.execute({
        context: platform,
        name: 'iglesia cristiana sion',
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(ConflictDomainException);
  });

  it('does not audit when the template fails', async () => {
    const { create, provisioner, audit } = build();
    provisioner.failWith = new Error('db down');

    await expect(
      create.execute({ context: platform, name: 'Nueva', ipAddress: null }),
    ).rejects.toThrow('db down');
    expect(audit.entries).toHaveLength(0);
  });

  it('is closed to a tenant context', async () => {
    const { create, repository } = build();

    await expect(
      create.execute({ context: tenant, name: 'Otra', ipAddress: null }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    expect(repository.rows).toHaveLength(0);
  });
});

describe('DENOMINATION_TEMPLATE', () => {
  it('only references accounts that exist and never defines tithe percentages', () => {
    const codes = new Set(DENOMINATION_TEMPLATE.accounts.map((a) => a.code));

    for (const account of DENOMINATION_TEMPLATE.accounts) {
      if (account.parentCode) {
        expect(codes.has(account.parentCode)).toBe(true);
        // Parents are declared first: the provisioner needs their ids.
        expect(
          DENOMINATION_TEMPLATE.accounts.findIndex(
            (a) => a.code === account.parentCode,
          ),
        ).toBeLessThan(DENOMINATION_TEMPLATE.accounts.indexOf(account));
      }
    }
    for (const type of DENOMINATION_TEMPLATE.contributionTypes) {
      const account = DENOMINATION_TEMPLATE.accounts.find(
        (a) => a.code === type.accountCode,
      );
      expect(account?.isPostable).toBe(true);
      expect(account?.nature).toBe('INCOME');
    }
    expect(JSON.stringify(DENOMINATION_TEMPLATE)).not.toMatch(
      /rate|porcentaje/i,
    );
  });

  it('ships the five certificate types and the four contribution types', () => {
    expect(DENOMINATION_TEMPLATE.certificateTypes.map((t) => t.code)).toEqual([
      'MEM',
      'TRA',
      'BAU',
      'ASI',
      'DON',
    ]);
    expect(
      DENOMINATION_TEMPLATE.contributionTypes.map((t) => t.category),
    ).toEqual(['TITHE', 'OFFERING', 'FIRST_FRUITS', 'VOW']);
  });
});

describe('RenameDenominationUseCase', () => {
  it('renames and audits the difference', async () => {
    const { rename, repository, audit } = build();
    const row = repository.seed('Antigua');

    const result = await rename.execute({
      context: platform,
      id: row.id,
      name: 'Nueva',
      ipAddress: null,
    });

    expect(result.name).toBe('Nueva');
    expect(audit.entries[0]).toMatchObject({
      action: 'UPDATE',
      changes: { name: { from: 'Antigua', to: 'Nueva' } },
    });
  });

  it('does nothing and audits nothing when the name does not change', async () => {
    const { rename, repository, audit } = build();
    const row = repository.seed('Igual');

    await rename.execute({
      context: platform,
      id: row.id,
      name: ' Igual ',
      ipAddress: null,
    });

    expect(audit.entries).toHaveLength(0);
  });

  it('may keep its own name with another spelling but not take another one', async () => {
    const { rename, repository } = build();
    const first = repository.seed('Sión');
    repository.seed('Betania');

    await expect(
      rename.execute({
        context: platform,
        id: first.id,
        name: 'SION',
        ipAddress: null,
      }),
    ).resolves.toMatchObject({ name: 'SION' });
    await expect(
      rename.execute({
        context: platform,
        id: first.id,
        name: 'betania',
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_NAME' });
  });

  it('answers 404 for a denomination that does not exist', async () => {
    const { rename } = build();

    await expect(
      rename.execute({ context: platform, id: 99, name: 'X', ipAddress: null }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('is closed to a tenant context', async () => {
    const { rename, repository } = build();
    const row = repository.seed('Propia');

    await expect(
      rename.execute({
        context: tenant,
        id: row.id,
        name: 'Otra',
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });

  it('validates the new name', async () => {
    const { rename, repository } = build();
    const row = repository.seed('Propia');

    await expect(
      rename.execute({
        context: platform,
        id: row.id,
        name: '',
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });
});

describe('SetDenominationStatusUseCase', () => {
  it('deactivates, audits DEACTIVATE and is idempotent', async () => {
    const { setStatus, repository, audit } = build();
    const row = repository.seed('Activa');

    const result = await setStatus.execute({
      context: platform,
      id: row.id,
      isActive: false,
      ipAddress: null,
    });
    await setStatus.execute({
      context: platform,
      id: row.id,
      isActive: false,
      ipAddress: null,
    });

    expect(result.isActive).toBe(false);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'DEACTIVATE',
      changes: { isActive: { from: true, to: false } },
    });
  });

  it('reactivates with ACTIVATE', async () => {
    const { setStatus, repository, audit } = build();
    const row = repository.seed('Inactiva', false);

    await setStatus.execute({
      context: platform,
      id: row.id,
      isActive: true,
      ipAddress: null,
    });

    expect(audit.entries[0]).toMatchObject({ action: 'ACTIVATE' });
  });

  it('is closed to a tenant context and answers 404 for unknown ids', async () => {
    const { setStatus, repository } = build();
    const row = repository.seed('Propia');

    await expect(
      setStatus.execute({
        context: tenant,
        id: row.id,
        isActive: false,
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(
      setStatus.execute({
        context: platform,
        id: 99,
        isActive: false,
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });
});

describe('ListDenominationsUseCase and GetDenominationStatsUseCase', () => {
  it('filters, paginates and projects the page', async () => {
    const { list, repository } = build();
    repository.seed('Alfa');
    repository.seed('Beta', false);
    repository.seed('Alfonso');

    const page = await list.execute(platform, {
      search: 'alf',
      status: 'active',
      page: 1,
      pageSize: 1,
    });

    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reports the totals', async () => {
    const { stats, repository } = build();
    repository.seed('A');
    repository.seed('B', false);

    await expect(stats.execute(platform)).resolves.toEqual({
      total: 2,
      active: 1,
      congregations: 0,
    });
  });

  it('are closed to a tenant context', async () => {
    const { list, stats } = build();

    await expect(
      list.execute(tenant, {
        search: '',
        status: 'all',
        page: 1,
        pageSize: 10,
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(stats.execute(tenant)).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
  });
});
