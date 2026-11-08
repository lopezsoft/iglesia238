import {
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
  ServiceUnavailableDomainException,
} from '../../../../common/errors/domain.exception.js';
import type {
  AuditEntry,
  AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import type { TransactionRunner } from '../../../../common/persistence/transaction.js';
import {
  StorageUnavailableError,
  type FileStorage,
} from '../../../../common/storage/file-storage.port.js';
import { buildTenantContext } from '../../../../../test/support/tenants.js';
import { jpeg, png, toBase64 } from '../../../../../test/support/images.js';
import { BrandingErrorCode } from '../branding-errors.js';
import { DEFAULT_PRIMARY_COLOR, LOGO_MAX_BYTES } from '../branding-rules.js';
import type { BrandingChanges, BrandingRecord } from '../branding.models.js';
import type {
  BrandingRepository,
  LogoEmbeddingProbe,
} from '../ports/branding.ports.js';
import {
  GetBrandingUseCase,
  ReadLogoFileUseCase,
  RemoveLogoUseCase,
  UpdateBrandColorUseCase,
  UploadLogoUseCase,
} from './branding.use-cases.js';

class InMemoryBranding implements BrandingRepository {
  readonly rows = new Map<number, BrandingRecord>([
    [
      1,
      {
        denominationId: 1,
        denominationName: 'Monte de Sion',
        logoKey: null,
        primaryColor: null,
      },
    ],
    [
      2,
      {
        denominationId: 2,
        denominationName: 'Otra Iglesia',
        logoKey: null,
        primaryColor: null,
      },
    ],
  ]);
  find(denominationId: number) {
    return Promise.resolve(this.rows.get(denominationId) ?? null);
  }
  update(denominationId: number, changes: BrandingChanges) {
    const row = this.rows.get(denominationId);
    if (!row) {
      return Promise.resolve(null);
    }
    const next = { ...row, ...changes };
    this.rows.set(denominationId, next);
    return Promise.resolve(next);
  }
}

class InMemoryStorage implements FileStorage {
  readonly files = new Map<string, Buffer>();
  failing = false;
  write(key: string, content: Buffer) {
    if (this.failing) {
      return Promise.reject(new StorageUnavailableError('disk full'));
    }
    this.files.set(key, content);
    return Promise.resolve();
  }
  read(key: string) {
    if (this.failing) {
      return Promise.reject(new StorageUnavailableError('disk gone'));
    }
    return Promise.resolve(this.files.get(key) ?? null);
  }
}

class Audit implements AuditRecorder {
  readonly entries: AuditEntry[] = [];
  record(entry: AuditEntry) {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

const transactions: TransactionRunner = {
  run: (work) => work({ kind: 'transaction' }),
};

function build() {
  const repository = new InMemoryBranding();
  const storage = new InMemoryStorage();
  const audit = new Audit();
  const probe = { embeddable: true, calls: 0 };
  const logoProbe: LogoEmbeddingProbe = {
    canEmbed: () => {
      probe.calls += 1;
      return Promise.resolve(probe.embeddable);
    },
  };
  return {
    repository,
    storage,
    audit,
    probe,
    get: new GetBrandingUseCase(repository),
    upload: new UploadLogoUseCase(
      repository,
      storage,
      logoProbe,
      transactions,
      audit,
    ),
    remove: new RemoveLogoUseCase(repository, transactions, audit),
    color: new UpdateBrandColorUseCase(repository, transactions, audit),
    read: new ReadLogoFileUseCase(storage),
  };
}

const admin = buildTenantContext({
  kind: 'DENOMINATION',
  denominationId: 1,
  permissions: ['branding.manage'],
});
const LOGO = png(120, 60);
const logoBase64 = toBase64(LOGO);

async function failure(
  run: () => Promise<unknown>,
): Promise<{ code: string } & Error> {
  try {
    await run();
  } catch (error) {
    return error as { code: string } & Error;
  }
  throw new Error('Expected the call to be rejected');
}

describe('GetBrandingUseCase', () => {
  it('answers the identity of the denomination of the session, with the limits of the form', async () => {
    const world = build();

    await expect(world.get.execute(admin)).resolves.toEqual({
      denominationName: 'Monte de Sion',
      logoKey: null,
      primaryColor: null,
      defaultColor: DEFAULT_PRIMARY_COLOR,
      limits: {
        logoMaxBytes: LOGO_MAX_BYTES,
        logoMinDimension: 32,
        logoMaxDimension: 2000,
        minContrast: 4.5,
      },
    });
  });

  it('is not available in the platform scope: it has no denomination', async () => {
    const world = build();
    const platform = buildTenantContext({
      kind: 'PLATFORM',
      permissions: ['branding.manage'],
    });

    await expect(world.get.execute(platform)).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
  });
});

describe('UploadLogoUseCase', () => {
  it('stores the file named after its content, points the denomination to it and audits the change', async () => {
    const world = build();

    const view = await world.upload.execute(admin, logoBase64, '10.0.0.1');

    expect(view.logoKey).toMatch(/^branding\/1\/logo-[0-9a-f]{16}\.png$/);
    expect(world.storage.files.get(view.logoKey!)?.equals(LOGO)).toBe(true);
    expect(world.repository.rows.get(1)?.logoKey).toBe(view.logoKey);
    expect(world.audit.entries).toHaveLength(1);
    expect(world.audit.entries[0]).toMatchObject({
      action: 'DENOMINATION_LOGO_UPDATED',
      entity: 'Denomination',
      entityId: 1,
      ipAddress: '10.0.0.1',
    });
    expect(world.audit.entries[0].changes).toEqual({
      logoKey: { from: null, to: view.logoKey },
    });
  });

  it('does nothing when the same logo is uploaded again', async () => {
    const world = build();
    await world.upload.execute(admin, logoBase64);
    world.audit.entries.length = 0;
    world.storage.files.clear();

    await world.upload.execute(admin, logoBase64);

    expect(world.storage.files.size).toBe(0);
    expect(world.audit.entries).toHaveLength(0);
  });

  it('keeps the previous file when the logo is replaced: issued certificates still use it', async () => {
    const world = build();
    const first = await world.upload.execute(admin, logoBase64);
    const second = await world.upload.execute(admin, toBase64(jpeg(200, 100)));

    expect(second.logoKey).toMatch(/\.jpg$/);
    expect(second.logoKey).not.toBe(first.logoKey);
    expect(world.storage.files.has(first.logoKey!)).toBe(true);
    expect(world.storage.files.has(second.logoKey!)).toBe(true);
    expect(world.audit.entries.at(-1)?.changes).toEqual({
      logoKey: { from: first.logoKey, to: second.logoKey },
    });
  });

  it('does not touch the other denominations', async () => {
    const world = build();

    await world.upload.execute(admin, logoBase64);

    expect(world.repository.rows.get(2)?.logoKey).toBeNull();
    expect(
      [...world.storage.files.keys()].every((key) =>
        key.startsWith('branding/1/'),
      ),
    ).toBe(true);
  });

  it('rejects an invalid file before probing, storing or auditing anything', async () => {
    const world = build();

    for (const bad of [
      '',
      'not base64!',
      toBase64(Buffer.from('plain text')),
      `data:image/png;base64,${logoBase64}`,
    ]) {
      const error = await failure(() => world.upload.execute(admin, bad));
      expect(error).toBeInstanceOf(InvalidInputException);
    }
    expect(world.probe.calls).toBe(0);
    expect(world.storage.files.size).toBe(0);
    expect(world.audit.entries).toHaveLength(0);
    expect(world.repository.rows.get(1)?.logoKey).toBeNull();
  });

  it('rejects a picture the PDF library cannot embed, and stores nothing', async () => {
    const world = build();
    world.probe.embeddable = false;

    const error = await failure(() => world.upload.execute(admin, logoBase64));

    expect(error).toBeInstanceOf(InvalidInputException);
    expect(error.code).toBe(BrandingErrorCode.LOGO_NOT_EMBEDDABLE);
    expect(world.storage.files.size).toBe(0);
    expect(world.repository.rows.get(1)?.logoKey).toBeNull();
  });

  it('answers 503 when the storage is down, and leaves the denomination as it was', async () => {
    const world = build();
    world.storage.failing = true;

    const error = await failure(() => world.upload.execute(admin, logoBase64));

    expect(error).toBeInstanceOf(ServiceUnavailableDomainException);
    expect(error.code).toBe(BrandingErrorCode.STORAGE_UNAVAILABLE);
    expect(world.repository.rows.get(1)?.logoKey).toBeNull();
    expect(world.audit.entries).toHaveLength(0);
  });
});

describe('RemoveLogoUseCase', () => {
  it('drops the reference, keeps the file and audits it', async () => {
    const world = build();
    const uploaded = await world.upload.execute(admin, logoBase64);
    world.audit.entries.length = 0;

    const view = await world.remove.execute(admin);

    expect(view.logoKey).toBeNull();
    expect(world.repository.rows.get(1)?.logoKey).toBeNull();
    expect(world.storage.files.has(uploaded.logoKey!)).toBe(true);
    expect(world.audit.entries[0]).toMatchObject({
      action: 'DENOMINATION_LOGO_REMOVED',
    });
  });

  it('does nothing when there is no logo', async () => {
    const world = build();

    await expect(world.remove.execute(admin)).resolves.toMatchObject({
      logoKey: null,
    });
    expect(world.audit.entries).toHaveLength(0);
  });
});

describe('UpdateBrandColorUseCase', () => {
  it('stores the color in lowercase and audits the change', async () => {
    const world = build();

    const view = await world.color.execute(admin, '#8B0000');

    expect(view.primaryColor).toBe('#8b0000');
    expect(world.audit.entries[0]).toMatchObject({
      action: 'DENOMINATION_COLOR_UPDATED',
    });
    expect(world.audit.entries[0].changes).toEqual({
      primaryColor: { from: null, to: '#8b0000' },
    });
  });

  it('does nothing, and audits nothing, when the color is the same', async () => {
    const world = build();
    await world.color.execute(admin, '#8b0000');
    world.audit.entries.length = 0;

    await world.color.execute(admin, '#8B0000');

    expect(world.audit.entries).toHaveLength(0);
  });

  it('goes back to the default color with null or a blank text', async () => {
    const world = build();
    await world.color.execute(admin, '#8b0000');

    await expect(world.color.execute(admin, null)).resolves.toMatchObject({
      primaryColor: null,
    });
    await world.color.execute(admin, '#8b0000');
    await expect(world.color.execute(admin, '  ')).resolves.toMatchObject({
      primaryColor: null,
    });
  });

  it('leaves the color alone when the request has no color at all', async () => {
    const world = build();
    await world.color.execute(admin, '#8b0000');

    await expect(world.color.execute(admin, undefined)).resolves.toMatchObject({
      primaryColor: '#8b0000',
    });
  });

  it('rejects a color that is not #RRGGBB or is too light, and changes nothing', async () => {
    const world = build();

    for (const bad of ['red', '#12345', '#ffff00']) {
      await expect(world.color.execute(admin, bad)).rejects.toBeInstanceOf(
        InvalidInputException,
      );
    }
    expect(world.repository.rows.get(1)?.primaryColor).toBeNull();
    expect(world.audit.entries).toHaveLength(0);
  });
});

describe('ReadLogoFileUseCase', () => {
  it('serves a stored logo with its type', async () => {
    const world = build();
    const uploaded = await world.upload.execute(admin, logoBase64);
    const [, , fileName] = uploaded.logoKey!.split('/');

    const file = await world.read.execute(1, fileName);

    expect(file.mimeType).toBe('image/png');
    expect(file.content.equals(LOGO)).toBe(true);
  });

  it('serves the old logos too', async () => {
    const world = build();
    const first = await world.upload.execute(admin, logoBase64);
    await world.upload.execute(admin, toBase64(jpeg(200, 100)));

    await expect(
      world.read.execute(1, first.logoKey!.split('/')[2]),
    ).resolves.toMatchObject({
      mimeType: 'image/png',
    });
  });

  it('answers 404 for a logo of another denomination, a missing file and a name that is not a logo', async () => {
    const world = build();
    const uploaded = await world.upload.execute(admin, logoBase64);
    const [, , fileName] = uploaded.logoKey!.split('/');

    for (const [id, name] of [
      [2, fileName],
      [1, 'logo-0000000000000000.png'],
      [1, '../1/' + fileName],
      [1, 'logo-ABCDEF0123456789.png'],
      [1, 'logo-0123456789abcdef.svg'],
      [1, 'secret.txt'],
    ] as const) {
      const error = await failure(() => world.read.execute(id, name));
      expect(error).toBeInstanceOf(NotFoundDomainException);
      expect(error.code).toBe(BrandingErrorCode.LOGO_NOT_FOUND);
    }
  });

  it('answers 503 when the storage is down', async () => {
    const world = build();
    world.storage.failing = true;

    await expect(
      world.read.execute(1, 'logo-0123456789abcdef.png'),
    ).rejects.toBeInstanceOf(ServiceUnavailableDomainException);
  });
});
