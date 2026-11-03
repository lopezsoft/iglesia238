import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  isIsoDate,
  toIsoDateTimeOrNull,
} from '../../../common/mappers/value-mappers.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  currentPolicyId,
  policyState,
  POLICY_CONTENT_MAX_LENGTH,
  POLICY_CONTENT_MIN_LENGTH,
  POLICY_VERSION_MAX_LENGTH,
  type PolicyState,
  type PolicyStatus,
} from '../domain/current-policy.js';
import {
  PRIVACY_POLICIES_REPOSITORY,
  type PolicyDraft,
  type PolicyRecord,
  type PrivacyPoliciesRepository,
} from './ports/privacy-policies.repository.js';

export interface PolicyView {
  id: number;
  version: string;
  content: string;
  effectiveFrom: string;
  status: PolicyStatus;
  state: PolicyState;
  /** The policy applicants accept today. */
  isCurrent: boolean;
  publishedAt: string | null;
  consentCount: number;
  applicationCount: number;
}

export interface PolicyListView {
  items: PolicyView[];
  /** False when no published policy is in force: the public form is closed for the denomination. */
  hasCurrentPolicy: boolean;
}

const notFound = () => new NotFoundDomainException('La política no existe.');
const notEditable = () =>
  new ConflictDomainException(
    'Una política publicada no se puede modificar ni eliminar: las autorizaciones ya la citan. Crea una versión nueva.',
    'POLICY_NOT_EDITABLE',
  );
const versionTaken = () =>
  new ConflictDomainException(
    'Ya existe una política con esa versión. Usa otro número de versión.',
    'POLICY_VERSION_EXISTS',
  );

function toView(
  record: PolicyRecord,
  currentId: number | null,
  today: string,
): PolicyView {
  const state = policyState(record, currentId, today);
  return {
    id: record.id,
    version: record.version,
    content: record.content,
    effectiveFrom: record.effectiveFrom,
    status: record.status,
    state,
    isCurrent: state === 'CURRENT',
    publishedAt: toIsoDateTimeOrNull(record.publishedAt),
    consentCount: record.consentCount,
    applicationCount: record.applicationCount,
  };
}

function cleanDraft(draft: PolicyDraft): PolicyDraft {
  const version = draft.version.trim();
  const content = draft.content.trim();
  if (version === '' || version.length > POLICY_VERSION_MAX_LENGTH) {
    throw new InvalidInputException(
      `La versión es obligatoria y admite máximo ${POLICY_VERSION_MAX_LENGTH} caracteres.`,
    );
  }
  if (
    content.length < POLICY_CONTENT_MIN_LENGTH ||
    content.length > POLICY_CONTENT_MAX_LENGTH
  ) {
    throw new InvalidInputException(
      `El texto de la política debe tener entre ${POLICY_CONTENT_MIN_LENGTH} y ${POLICY_CONTENT_MAX_LENGTH} caracteres.`,
    );
  }
  if (!isIsoDate(draft.effectiveFrom)) {
    throw new InvalidInputException('La fecha de vigencia no es válida.');
  }
  return { version, content, effectiveFrom: draft.effectiveFrom };
}

@Injectable()
export class ListPrivacyPoliciesUseCase {
  constructor(
    @Inject(PRIVACY_POLICIES_REPOSITORY)
    private readonly policies: PrivacyPoliciesRepository,
    private readonly clock: Clock,
  ) {}

  async execute(tenant: TenantContext): Promise<PolicyListView> {
    const { denominationId } = tenant.tenantScope();
    const today = this.clock.today();
    const records = await this.policies.list(denominationId);
    const currentId = currentPolicyId(records, today);
    return {
      items: [...records]
        .sort(
          (a, b) =>
            b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id - a.id,
        )
        .map((record) => toView(record, currentId, today)),
      hasCurrentPolicy: currentId !== null,
    };
  }
}

/** Creates a draft. It becomes visible to applicants only after it is published. */
@Injectable()
export class CreatePrivacyPolicyUseCase {
  constructor(
    @Inject(PRIVACY_POLICIES_REPOSITORY)
    private readonly policies: PrivacyPoliciesRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    input: PolicyDraft,
    ip: string | null,
  ): Promise<PolicyView> {
    const { denominationId } = tenant.tenantScope();
    const draft = cleanDraft(input);

    const id = await this.transactions.run(async (transaction) => {
      if (
        await this.policies.versionExists(
          denominationId,
          draft.version,
          null,
          transaction,
        )
      ) {
        throw versionTaken();
      }
      const createdId = await this.policies.create(
        denominationId,
        draft,
        transaction,
      );
      await this.audit.record(
        {
          action: 'POLICY_CREATED',
          entity: 'PrivacyPolicy',
          entityId: createdId,
          actor: tenant,
          congregationId: null,
          changes: buildAuditChanges(
            null,
            {
              version: draft.version,
              effectiveFrom: draft.effectiveFrom,
              status: 'DRAFT',
            },
            ['version', 'effectiveFrom', 'status'],
          ),
          ipAddress: ip,
        },
        transaction,
      );
      return createdId;
    });

    return this.read(denominationId, id);
  }

  private async read(denominationId: number, id: number): Promise<PolicyView> {
    const record = await this.policies.find(denominationId, id);
    if (!record) {
      throw notFound();
    }
    return toView(record, null, this.clock.today());
  }
}

@Injectable()
export class UpdatePrivacyPolicyUseCase {
  constructor(
    @Inject(PRIVACY_POLICIES_REPOSITORY)
    private readonly policies: PrivacyPoliciesRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    input: PolicyDraft,
    ip: string | null,
  ): Promise<PolicyView> {
    const { denominationId } = tenant.tenantScope();
    const draft = cleanDraft(input);

    await this.transactions.run(async (transaction) => {
      const current = await this.policies.find(denominationId, id, transaction);
      if (!current) {
        throw notFound();
      }
      if (current.status !== 'DRAFT') {
        throw notEditable();
      }
      if (
        await this.policies.versionExists(
          denominationId,
          draft.version,
          id,
          transaction,
        )
      ) {
        throw versionTaken();
      }
      if (
        !(await this.policies.updateDraft(
          denominationId,
          id,
          draft,
          transaction,
        ))
      ) {
        throw notEditable();
      }
      await this.audit.record(
        {
          action: 'POLICY_UPDATED',
          entity: 'PrivacyPolicy',
          entityId: id,
          actor: tenant,
          congregationId: null,
          changes: buildAuditChanges(
            { version: current.version, effectiveFrom: current.effectiveFrom },
            { version: draft.version, effectiveFrom: draft.effectiveFrom },
            ['version', 'effectiveFrom'],
          ),
          ipAddress: ip,
        },
        transaction,
      );
    });

    const record = await this.policies.find(denominationId, id);
    if (!record) {
      throw notFound();
    }
    return toView(record, null, this.clock.today());
  }
}

@Injectable()
export class DeletePrivacyPolicyUseCase {
  constructor(
    @Inject(PRIVACY_POLICIES_REPOSITORY)
    private readonly policies: PrivacyPoliciesRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    ip: string | null,
  ): Promise<void> {
    const { denominationId } = tenant.tenantScope();
    await this.transactions.run(async (transaction) => {
      const current = await this.policies.find(denominationId, id, transaction);
      if (!current) {
        throw notFound();
      }
      if (current.status !== 'DRAFT') {
        throw notEditable();
      }
      if (!(await this.policies.deleteDraft(denominationId, id, transaction))) {
        throw notEditable();
      }
      await this.audit.record(
        {
          action: 'POLICY_DELETED',
          entity: 'PrivacyPolicy',
          entityId: id,
          actor: tenant,
          congregationId: null,
          changes: buildAuditChanges(
            { version: current.version, status: 'DRAFT' },
            { version: null, status: null },
            ['version', 'status'],
          ),
          ipAddress: ip,
        },
        transaction,
      );
    });
  }
}

/**
 * DRAFT -> PUBLISHED. A policy cannot take effect before today, so an older date is moved to today.
 * It also cannot take effect before another published policy: then it would never become current.
 */
@Injectable()
export class PublishPrivacyPolicyUseCase {
  constructor(
    @Inject(PRIVACY_POLICIES_REPOSITORY)
    private readonly policies: PrivacyPoliciesRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    ip: string | null,
  ): Promise<PolicyView> {
    const { denominationId } = tenant.tenantScope();
    const today = this.clock.today();

    await this.transactions.run(async (transaction) => {
      const current = await this.policies.find(denominationId, id, transaction);
      if (!current) {
        throw notFound();
      }
      if (current.status !== 'DRAFT') {
        throw new ConflictDomainException(
          'La política ya está publicada.',
          'POLICY_ALREADY_PUBLISHED',
        );
      }

      const effectiveFrom =
        current.effectiveFrom < today ? today : current.effectiveFrom;
      const latest = await this.policies.latestPublishedEffectiveFrom(
        denominationId,
        transaction,
      );
      if (latest !== null && effectiveFrom < latest) {
        throw new ConflictDomainException(
          'Ya hay una política publicada con vigencia posterior. Cambia la fecha de vigencia del borrador.',
          'POLICY_EFFECTIVE_DATE_OUTDATED',
        );
      }

      const published = await this.policies.publish(
        denominationId,
        id,
        effectiveFrom,
        this.clock.now(),
        transaction,
      );
      if (!published) {
        throw new ConflictDomainException(
          'La política ya está publicada.',
          'POLICY_ALREADY_PUBLISHED',
        );
      }
      await this.audit.record(
        {
          action: 'POLICY_PUBLISHED',
          entity: 'PrivacyPolicy',
          entityId: id,
          actor: tenant,
          congregationId: null,
          changes: buildAuditChanges(
            { status: 'DRAFT', effectiveFrom: current.effectiveFrom },
            { status: 'PUBLISHED', effectiveFrom },
            ['status', 'effectiveFrom'],
          ),
          ipAddress: ip,
        },
        transaction,
      );
    });

    const records = await this.policies.list(denominationId);
    const record = records.find((candidate) => candidate.id === id);
    if (!record) {
      throw notFound();
    }
    return toView(record, currentPolicyId(records, today), today);
  }
}
