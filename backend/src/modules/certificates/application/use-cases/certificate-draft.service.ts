import { Inject, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import {
  DONATION_TYPE_CODE,
  buildCertificateSnapshot,
  documentLabel,
  type CertificateSnapshot,
  type DonationInput,
  type Letterhead,
} from '../certificate-document.js';
import {
  NOTES_MAX_LENGTH,
  certificateTypeNotFound,
  donationAccessForbidden,
  fiscalYearInvalid,
  noDonationsInPeriod,
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
  CERTIFICATE_DONATION_READER,
  type CertificateDonationReader,
} from '../ports/certificate-donation.reader.js';
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
  /** Year of the contributions; only the donations certificate uses it (and requires it). */
  readonly fiscalYear?: number | null;
}

/** First year a donations certificate can ask for. */
export const MIN_FISCAL_YEAR = 2000;

/** Everything a certificate needs before it gets a number: validated type, member, notes and signers. */
export interface CertificateDraft {
  readonly type: CertificateTypeRecord;
  readonly member: CertificateMember;
  readonly notes: string | null;
  readonly letterhead: Letterhead;
  readonly signers: ResolvedSigners;
  readonly issuedByName: string;
  /** What the donations certificate adds up; null for every other type. */
  readonly donation: DonationInput | null;
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
    @Inject(CERTIFICATE_DONATION_READER)
    private readonly donations: CertificateDonationReader,
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
    // The amounts are the treasury's: checked before anything about the member is read.
    if (type.code === DONATION_TYPE_CODE && !tenant.has('contributions.read')) {
      throw donationAccessForbidden();
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

    const donation =
      type.code === DONATION_TYPE_CODE
        ? await this.donationsOf(
            scope,
            member.id,
            input.fiscalYear ?? null,
            today,
          )
        : null;

    return { type, member, notes, letterhead, signers, issuedByName, donation };
  }

  /** The contributions of the year: the whole year, or up to today when it is the current one. */
  private async donationsOf(
    scope: TenantScope,
    memberId: number,
    fiscalYear: number | null,
    today: string,
  ): Promise<DonationInput> {
    const currentYear = Number(today.slice(0, 4));
    if (
      fiscalYear === null ||
      !Number.isInteger(fiscalYear) ||
      fiscalYear < MIN_FISCAL_YEAR ||
      fiscalYear > currentYear
    ) {
      throw fiscalYearInvalid(currentYear);
    }
    const periodFrom = `${fiscalYear}-01-01`;
    const periodTo = fiscalYear === currentYear ? today : `${fiscalYear}-12-31`;
    const lines = await this.donations.summarize(scope, memberId, {
      from: periodFrom,
      to: periodTo,
    });
    if (lines.reduce((sum, line) => sum + line.amountCents, 0) <= 0) {
      throw noDonationsInPeriod(fiscalYear);
    }
    return { fiscalYear, periodFrom, periodTo, lines };
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
      introTemplate: type.introTemplate,
      closingTemplate: type.closingTemplate,
      pastorTitleTemplate: type.pastorTitleTemplate,
      secretaryTitleTemplate: type.secretaryTitleTemplate,
      issuedOn,
      donation: draft.donation,
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
