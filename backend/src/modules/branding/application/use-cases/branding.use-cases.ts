import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import { NotFoundDomainException } from '../../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import {
  FILE_STORAGE,
  StorageUnavailableError,
  type FileStorage,
} from '../../../../common/storage/file-storage.port.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import {
  logoNotEmbeddable,
  logoNotFound,
  storageUnavailable,
} from '../branding-errors.js';
import {
  DEFAULT_PRIMARY_COLOR,
  LOGO_FILE_NAME,
  LOGO_MAX_BYTES,
  LOGO_MAX_DIMENSION,
  LOGO_MIN_DIMENSION,
  MIN_COLOR_CONTRAST,
  acceptColor,
  acceptLogo,
  logoKey,
} from '../branding-rules.js';
import type {
  BrandingChanges,
  BrandingRecord,
  BrandingView,
  LogoFile,
} from '../branding.models.js';
import {
  BRANDING_REPOSITORY,
  LOGO_EMBEDDING_PROBE,
  type BrandingRepository,
  type LogoEmbeddingProbe,
} from '../ports/branding.ports.js';
function toView(record: BrandingRecord): BrandingView {
  return {
    denominationName: record.denominationName,
    logoKey: record.logoKey,
    primaryColor: record.primaryColor,
    defaultColor: DEFAULT_PRIMARY_COLOR,
    limits: {
      logoMaxBytes: LOGO_MAX_BYTES,
      logoMinDimension: LOGO_MIN_DIMENSION,
      logoMaxDimension: LOGO_MAX_DIMENSION,
      minContrast: MIN_COLOR_CONTRAST,
    },
  };
}

/** The identity belongs to the denomination of the session; a platform scope has none. */
async function currentRecord(
  repository: BrandingRepository,
  tenant: TenantContext,
): Promise<BrandingRecord> {
  const record = await repository.find(tenant.tenantScope().denominationId);
  if (!record) {
    throw new NotFoundDomainException('La denominación no existe.');
  }
  return record;
}

@Injectable()
export class GetBrandingUseCase {
  constructor(
    @Inject(BRANDING_REPOSITORY)
    private readonly repository: BrandingRepository,
  ) {}

  async execute(tenant: TenantContext): Promise<BrandingView> {
    return toView(await currentRecord(this.repository, tenant));
  }
}

/**
 * Stores the logo of the denomination. The file goes to the storage first, named after its content; only then does
 * the denomination point to it. A failure in between leaves an unused file, never a broken reference. Old logos stay
 * in the storage: certificates already issued keep printing the one they were issued with.
 */
@Injectable()
export class UploadLogoUseCase {
  constructor(
    @Inject(BRANDING_REPOSITORY)
    private readonly repository: BrandingRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(LOGO_EMBEDDING_PROBE) private readonly probe: LogoEmbeddingProbe,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    tenant: TenantContext,
    contentBase64: string,
    ipAddress: string | null = null,
  ): Promise<BrandingView> {
    const existing = await currentRecord(this.repository, tenant);
    const logo = acceptLogo(contentBase64);
    if (!(await this.probe.canEmbed(logo.bytes))) {
      throw logoNotEmbeddable();
    }
    const key = logoKey(existing.denominationId, logo);
    if (existing.logoKey === key) {
      return toView(existing);
    }
    try {
      await this.storage.write(key, logo.bytes);
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        throw storageUnavailable();
      }
      throw error;
    }
    const updated = await this.transactions.run(async (transaction) => {
      const row = await this.repository.update(
        existing.denominationId,
        { logoKey: key },
        transaction,
      );
      if (!row) {
        throw new NotFoundDomainException('La denominación no existe.');
      }
      await this.audit.record(
        {
          action: 'DENOMINATION_LOGO_UPDATED',
          entity: 'Denomination',
          entityId: existing.denominationId,
          actor: tenant,
          changes: buildAuditChanges(
            { logoKey: existing.logoKey },
            { logoKey: key },
            ['logoKey'],
          ),
          ipAddress,
        },
        transaction,
      );
      return row;
    });
    return toView(updated);
  }
}

@Injectable()
export class RemoveLogoUseCase {
  constructor(
    @Inject(BRANDING_REPOSITORY)
    private readonly repository: BrandingRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /** The file stays in the storage (issued certificates may still use it); only the reference goes. */
  async execute(
    tenant: TenantContext,
    ipAddress: string | null = null,
  ): Promise<BrandingView> {
    const existing = await currentRecord(this.repository, tenant);
    if (existing.logoKey === null) {
      return toView(existing);
    }
    const updated = await this.transactions.run(async (transaction) => {
      const row = await this.repository.update(
        existing.denominationId,
        { logoKey: null },
        transaction,
      );
      if (!row) {
        throw new NotFoundDomainException('La denominación no existe.');
      }
      await this.audit.record(
        {
          action: 'DENOMINATION_LOGO_REMOVED',
          entity: 'Denomination',
          entityId: existing.denominationId,
          actor: tenant,
          changes: buildAuditChanges(
            { logoKey: existing.logoKey },
            { logoKey: null },
            ['logoKey'],
          ),
          ipAddress,
        },
        transaction,
      );
      return row;
    });
    return toView(updated);
  }
}

@Injectable()
export class UpdateBrandColorUseCase {
  constructor(
    @Inject(BRANDING_REPOSITORY)
    private readonly repository: BrandingRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /** `undefined` changes nothing; `null` or a blank text goes back to the default color of the system. */
  async execute(
    tenant: TenantContext,
    input: unknown,
    ipAddress: string | null = null,
  ): Promise<BrandingView> {
    const existing = await currentRecord(this.repository, tenant);
    // A body without the field asks for nothing: it must not wipe the color.
    if (input === undefined) {
      return toView(existing);
    }
    const color = acceptColor(input);
    if (existing.primaryColor === color) {
      return toView(existing);
    }
    const changes: BrandingChanges = { primaryColor: color };
    const updated = await this.transactions.run(async (transaction) => {
      const row = await this.repository.update(
        existing.denominationId,
        changes,
        transaction,
      );
      if (!row) {
        throw new NotFoundDomainException('La denominación no existe.');
      }
      await this.audit.record(
        {
          action: 'DENOMINATION_COLOR_UPDATED',
          entity: 'Denomination',
          entityId: existing.denominationId,
          actor: tenant,
          changes: buildAuditChanges(
            { primaryColor: existing.primaryColor },
            { primaryColor: color },
            ['primaryColor'],
          ),
          ipAddress,
        },
        transaction,
      );
      return row;
    });
    return toView(updated);
  }
}

/**
 * A logo file for the public route. It serves any logo the denomination ever had (the name carries a hash of the
 * content, so it cannot be guessed and never changes), because old certificates are printed with old logos.
 */
@Injectable()
export class ReadLogoFileUseCase {
  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStorage) {}

  async execute(denominationId: number, fileName: string): Promise<LogoFile> {
    if (!LOGO_FILE_NAME.test(fileName)) {
      throw logoNotFound();
    }
    let content: Buffer | null;
    try {
      content = await this.storage.read(
        `branding/${denominationId}/${fileName}`,
      );
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        throw storageUnavailable();
      }
      throw error;
    }
    if (!content) {
      throw logoNotFound();
    }
    return {
      content,
      mimeType: fileName.endsWith('.png') ? 'image/png' : 'image/jpeg',
    };
  }
}
