import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import {
  buildCertificateSnapshot,
  DEFAULT_TEXT_HINTS,
  PLACEHOLDER_DESCRIPTIONS,
  TEMPLATE_PLACEHOLDERS,
} from '../certificate-document.js';
import { certificateTypeNotFound } from '../certificate-errors.js';
import { toTypeTemplateView } from '../certificate-mappers.js';
import { validatedTypeChanges } from '../certificate-type-rules.js';
import type {
  CertificateTypeChanges,
  CertificateTypeRecord,
  CertificateTypeTemplateView,
  TemplateCatalogView,
  TemplatePreviewView,
} from '../certificate.models.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';

const AUDITED_FIELDS = [
  'name',
  'validityDays',
  'bodyText',
  'introText',
  'closingText',
  'pastorTitleText',
  'clerkTitleText',
] as const;

/**
 * The type as it goes to the audit log. The keys are neutral on purpose: the audit refuses field names that
 * look like credentials, and «secretary…» contains «secret». The values are texts of the denomination, never
 * personal data.
 */
function auditable(type: CertificateTypeRecord) {
  return {
    name: type.name,
    validityDays: type.validityDays,
    bodyText: type.template,
    introText: type.introTemplate,
    closingText: type.closingTemplate,
    pastorTitleText: type.pastorTitleTemplate,
    clerkTitleText: type.secretaryTitleTemplate,
  };
}

/** Types of the denomination with their customized texts, plus what the editor needs to offer. */
@Injectable()
export class ListCertificateTypeTemplatesUseCase {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
  ) {}

  async execute(tenant: TenantContext): Promise<TemplateCatalogView> {
    const types = await this.certificates.listTypes(tenant.tenantScope());
    return {
      types: types.map(toTypeTemplateView),
      placeholders: TEMPLATE_PLACEHOLDERS.map((key) => ({
        key,
        description: PLACEHOLDER_DESCRIPTIONS[key],
      })),
      defaults: DEFAULT_TEXT_HINTS,
    };
  }
}

/**
 * Edits the name, validity and printed texts of a certificate type of the denomination. Certificates already
 * issued do not change: each one keeps the text it was printed with (its snapshot).
 */
@Injectable()
export class UpdateCertificateTypeUseCase {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    tenant: TenantContext,
    typeId: number,
    input: CertificateTypeChanges,
    ipAddress: string | null = null,
  ): Promise<CertificateTypeTemplateView> {
    const scope = tenant.tenantScope();
    const existing = await this.certificates.findType(scope, typeId);
    if (!existing) {
      throw certificateTypeNotFound();
    }
    const changes = validatedTypeChanges(input);
    const auditChanges = buildAuditChanges(
      auditable(existing),
      auditable({ ...existing, ...changes }),
      AUDITED_FIELDS,
    );
    if (Object.keys(auditChanges).length === 0) {
      return toTypeTemplateView(existing);
    }

    const updated = await this.transactions.run(async (transaction) => {
      const row = await this.certificates.updateType(
        scope,
        existing.id,
        changes,
        transaction,
      );
      if (!row) {
        throw certificateTypeNotFound();
      }
      await this.audit.record(
        {
          action: 'CERTIFICATE_TYPE_UPDATED',
          entity: 'CertificateType',
          entityId: existing.id,
          actor: tenant,
          changes: auditChanges,
          ipAddress,
        },
        transaction,
      );
      return row;
    });
    return toTypeTemplateView(updated);
  }
}

/** Sample data of the preview: nobody real, so the editor never touches a member. */
const SAMPLE = {
  denominationName: 'Su denominación',
  legalName: 'Su razón social',
  taxId: '900.000.000-0',
  congregationName: 'Sede Central',
  cityName: 'Bogotá, D.C.',
  locationLine: 'Sede Central · Bogotá, D.C.',
  pastorName: 'Pastor(a) de ejemplo',
  secretaryName: 'Secretario(a) de ejemplo',
  member: {
    fullName: 'María Fernanda Pérez Gómez',
    code: 'SC-0001',
    documentLabel: 'CC 52.000.000',
    joinedOn: '2015-03-15',
    waterBaptismOn: '2014-12-07',
  },
} as const;

/** Renders a sample certificate with the texts being edited (merged over the saved ones). Saves nothing. */
@Injectable()
export class PreviewCertificateTemplateUseCase {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    typeId: number,
    input: CertificateTypeChanges,
  ): Promise<TemplatePreviewView> {
    const existing = await this.certificates.findType(
      tenant.tenantScope(),
      typeId,
    );
    if (!existing) {
      throw certificateTypeNotFound();
    }
    const type: CertificateTypeRecord = {
      ...existing,
      ...validatedTypeChanges(input),
    };
    const snapshot = buildCertificateSnapshot({
      number: 'CERT-EJEMPLO-0001',
      typeCode: type.code,
      typeName: type.name,
      template: type.template,
      introTemplate: type.introTemplate,
      closingTemplate: type.closingTemplate,
      pastorTitleTemplate: type.pastorTitleTemplate,
      secretaryTitleTemplate: type.secretaryTitleTemplate,
      issuedOn: this.clock.today(),
      letterhead: {
        denominationName: SAMPLE.denominationName,
        legalName: SAMPLE.legalName,
        taxId: SAMPLE.taxId,
        congregationName: SAMPLE.congregationName,
        cityName: SAMPLE.cityName,
        locationLine: SAMPLE.locationLine,
      },
      pastorName: SAMPLE.pastorName,
      secretaryName: SAMPLE.secretaryName,
      issuedByName: SAMPLE.secretaryName,
      notes: null,
      member: SAMPLE.member,
    });
    return {
      title: snapshot.title,
      intro: snapshot.intro,
      body: snapshot.body,
      closing: snapshot.closing,
      pastorName: snapshot.pastorName,
      pastorTitle: snapshot.pastorTitle,
      secretaryName: snapshot.secretaryName ?? '',
      secretaryTitle: snapshot.secretaryTitle,
    };
  }
}
