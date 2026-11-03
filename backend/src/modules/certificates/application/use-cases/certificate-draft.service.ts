import { Inject, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import {
  buildCertificateSnapshot,
  documentLabel,
  type CertificateSnapshot,
  type Letterhead,
} from '../certificate-document.js';
import {
  NOTES_MAX_LENGTH,
  certificateTypeNotFound,
  memberNotActive,
  memberNotBaptized,
  memberNotFound,
  notesTooLong,
} from '../certificate-errors.js';
import type {
  CertificateMember,
  CertificateTypeRecord,
  ResolvedSigners,
} from '../certificate.models.js';
import {
  CERTIFICATE_CONTEXT_READER,
  type CertificateContextReader,
} from '../ports/certificate-context.reader.js';
import {
  CERTIFICATE_MEMBER_READER,
  type CertificateMemberReader,
} from '../ports/certificate-member.reader.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';

export interface DraftInput {
  readonly memberId: number;
  readonly certificateTypeId: number;
  readonly notes: string | null;
}

/** Everything a certificate needs before it gets a number: validated type, member, notes and signers. */
export interface CertificateDraft {
  readonly type: CertificateTypeRecord;
  readonly member: CertificateMember;
  readonly notes: string | null;
  readonly letterhead: Letterhead;
  readonly signers: ResolvedSigners;
  readonly issuedByName: string;
}

/**
 * Validates the request of a certificate in the order the business rules define (type, member,
 * baptism, notes) and gathers the data to print. Preview and issue share it, so what the person
 * sees is what gets stored.
 */
@Injectable()
export class CertificateDraftService {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
    @Inject(CERTIFICATE_MEMBER_READER)
    private readonly members: CertificateMemberReader,
    @Inject(CERTIFICATE_CONTEXT_READER)
    private readonly context: CertificateContextReader,
  ) {}

  async prepare(
    tenant: TenantContext,
    scope: TenantScope,
    input: DraftInput,
    today: string,
  ): Promise<CertificateDraft> {
    const type = await this.certificates.findType(
      scope,
      input.certificateTypeId,
    );
    if (!type) {
      throw certificateTypeNotFound();
    }

    const member = await this.members.findMember(scope, input.memberId);
    if (!member) {
      throw memberNotFound();
    }
    if (member.status !== 'ACTIVE') {
      throw memberNotActive();
    }
    if (type.code === 'BAU' && member.isBaptized !== true) {
      throw memberNotBaptized();
    }

    const notes = input.notes?.trim() || null;
    if (notes && notes.length > NOTES_MAX_LENGTH) {
      throw notesTooLong();
    }

    const letterhead = await this.context.findLetterhead(scope);
    if (!letterhead) {
      throw new NotFoundDomainException('La sede no existe.');
    }
    const signers = await this.context.findSigners(scope, tenant.userId, today);
    const issuedByName =
      (await this.context.findUserName(tenant.userId)) ?? '—';

    return { type, member, notes, letterhead, signers, issuedByName };
  }

  snapshotOf(
    draft: CertificateDraft,
    number: string,
    issuedOn: string,
  ): CertificateSnapshot {
    const { type, member } = draft;
    return buildCertificateSnapshot({
      number,
      typeCode: type.code,
      typeName: type.name,
      template: type.template,
      issuedOn,
      letterhead: draft.letterhead,
      pastorName: draft.signers.pastor?.name ?? null,
      secretaryName: draft.signers.secretary?.name ?? null,
      issuedByName: draft.issuedByName,
      notes: draft.notes,
      member: {
        fullName: member.fullName,
        code: member.code,
        documentLabel: documentLabel(
          member.documentTypeCode,
          member.documentNumber,
        ),
        joinedOn: member.joinedOn,
        waterBaptismOn: member.waterBaptismOn,
      },
    });
  }
}
