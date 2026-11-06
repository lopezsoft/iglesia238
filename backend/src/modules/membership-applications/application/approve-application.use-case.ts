import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
  ConflictDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  DocumentNumberingService,
  formatMemberCode,
} from '../../../common/numbering/document-numbering.service.js';
import {
  TRANSACTION_RUNNER,
  type Transaction,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import { isMinorOn } from '../../../common/people/age.js';
import { normalizeDocumentNumber } from '../../../common/people/document-number.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { isReviewable } from '../domain/application-status.js';
import type { ApplicationGuardian } from '../domain/application-form-data.js';
import { registryPositionOf } from '../domain/registry-position.js';
import {
  applicationNotFound,
  duplicateDocument,
  invalidMatch,
  invalidTransition,
} from './application-errors.js';
import type { ApprovalResultView } from './application-views.js';
import { documentRefOf, sameDocument } from './application.assembler.js';
import {
  APPLICATIONS_REPOSITORY,
  type ApplicationRecord,
  type ApplicationsRepository,
} from './ports/applications.repository.js';
import {
  MEMBERSHIP_REGISTRY,
  type DocumentRef,
  type ExistingPerson,
  type MembershipRegistry,
  type PersonData,
} from './ports/membership-registry.port.js';

export interface ApproveApplicationInput {
  /**
   * Person already registered in the denomination (a relative, a guardian, a contributor, a former
   * member) that holds the document of the application. Without it, a duplicate document blocks the
   * approval; with it, the application is approved on top of that person instead of creating another.
   */
  linkToPersonId: number | null;
}

/**
 * PENDING or IN_REVIEW -> APPROVED. In one transaction it creates (or completes) the person, the
 * member, its registry entry with the next member number of the congregation, the status history and
 * the data consent, plus the guardian of a minor. If any step fails nothing is saved.
 */
@Injectable()
export class ApproveApplicationUseCase {
  constructor(
    @Inject(APPLICATIONS_REPOSITORY)
    private readonly applications: ApplicationsRepository,
    @Inject(MEMBERSHIP_REGISTRY) private readonly registry: MembershipRegistry,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly numbering: DocumentNumberingService,
    private readonly clock: Clock,
  ) {}

  execute(
    tenant: TenantContext,
    id: number,
    input: ApproveApplicationInput,
    ip: string | null,
  ): Promise<ApprovalResultView> {
    const scope = tenant.tenantScope();
    return this.transactions.run((transaction) =>
      this.approve(tenant, scope, id, input, ip, transaction),
    );
  }

  private async approve(
    tenant: TenantContext,
    scope: TenantScope,
    id: number,
    input: ApproveApplicationInput,
    ip: string | null,
    transaction: Transaction,
  ): Promise<ApprovalResultView> {
    const record = await this.applications.findById(scope, id, transaction);
    if (!record) {
      throw applicationNotFound();
    }
    if (!isReviewable(record.status)) {
      throw invalidTransition();
    }

    const today = this.clock.today();
    const ref = documentRefOf(record);
    if (!ref) {
      throw new BusinessRuleException(
        'La solicitud no tiene un documento de identidad.',
        'DOCUMENT_REQUIRED',
      );
    }
    const guardian = this.requireGuardian(record, today);
    const existing = await this.resolveExistingPerson(
      scope,
      ref,
      input,
      transaction,
    );
    if (guardian && this.isSamePerson(guardian, ref)) {
      throw new BusinessRuleException(
        'El acudiente no puede ser la misma persona que el solicitante.',
        'GUARDIAN_SAME_AS_APPLICANT',
      );
    }

    // Claim the application first: a second reviewer deciding at the same time loses here, and
    // everything written afterwards rolls back with the transaction.
    const claimed = await this.applications.transition(
      scope,
      id,
      ['PENDING', 'IN_REVIEW'],
      {
        status: 'APPROVED',
        reviewerId: tenant.userId,
        reviewedAt: this.clock.now(),
        matchedPersonId: null,
      },
      transaction,
    );
    if (!claimed) {
      throw invalidTransition();
    }

    const guardianPersonId = guardian
      ? await this.ensureGuardian(scope, guardian, transaction)
      : null;

    const personData = this.personDataOf(record, ref);
    let personId: number;
    if (existing) {
      personId = existing.id;
      await this.registry.completePerson(
        scope,
        personId,
        personData,
        transaction,
      );
    } else {
      personId = await this.registry.createPerson(
        scope,
        personData,
        transaction,
      );
    }

    const congregationScope = scope.forCongregation(record.congregationId);
    const memberNumber = await this.numbering.nextMemberNumber(
      congregationScope,
      transaction,
    );

    let memberId: number;
    const ecclesiasticalFields = {
      previousCongregationName: record.formData.previousCongregationName,
      previousCongregationId: record.formData.previousCongregationId ?? null,
      convertedOn: record.formData.convertedOn ?? null,
      isBaptized: record.formData.isBaptized,
      waterBaptismOn: record.formData.waterBaptismOn ?? null,
      baptismMunicipalityCode: record.formData.baptismMunicipalityCode ?? null,
      baptismPlace: record.formData.baptismPlace ?? null,
      baptizingPastorName: record.formData.baptizingPastorName ?? null,
      holySpiritBaptismOn: record.formData.holySpiritBaptismOn ?? null,
      reconciledOn: record.formData.reconciledOn ?? null,
      isChristianEducationTeacher:
        record.formData.isChristianEducationTeacher ?? false,
      desiredAreas: record.formData.desiredAreas ?? null,
      pastPositionsText: record.formData.pastPositionsText ?? null,
      currentPositionsText: record.formData.currentPositionsText ?? null,
    };
    if (existing?.member) {
      memberId = existing.member.id;
      await this.registry.reactivateMember(
        scope,
        {
          memberId,
          congregationId: record.congregationId,
          ...ecclesiasticalFields,
        },
        transaction,
      );
    } else {
      memberId = await this.registry.createMember(
        scope,
        {
          personId,
          congregationId: record.congregationId,
          joinedOn: today,
          ...ecclesiasticalFields,
        },
        transaction,
      );
    }

    const position = registryPositionOf(memberNumber);
    await this.registry.openRegistryEntry(
      scope,
      {
        memberId,
        congregationId: record.congregationId,
        memberNumber,
        registryBook: position.book,
        registryFolio: position.folio,
        startedOn: today,
      },
      transaction,
    );
    await this.registry.recordStatus(
      scope,
      {
        memberId,
        status: 'ACTIVE',
        startedOn: today,
        reason: existing?.member
          ? 'Reintegro por solicitud de membresía'
          : 'Ingreso por solicitud de membresía',
        userId: tenant.userId,
      },
      transaction,
    );
    await this.registry.recordConsent(
      scope,
      {
        personId,
        guardianId: guardianPersonId,
        policyId: record.policyId,
        grantedAt: record.consentedAt,
      },
      transaction,
    );
    if (guardianPersonId !== null) {
      await this.registry.linkGuardian(
        scope,
        personId,
        guardianPersonId,
        transaction,
      );
    }
    await this.applications.attachMember(scope, id, memberId, transaction);

    await this.audit.record(
      {
        action: 'APPLICATION_APPROVED',
        entity: 'MembershipApplication',
        entityId: id,
        actor: tenant,
        congregationId: record.congregationId,
        changes: buildAuditChanges(
          {
            status: record.status,
            memberNumber: null,
            linkedExistingPerson: false,
            guardianLinked: false,
          },
          {
            status: 'APPROVED',
            memberNumber,
            linkedExistingPerson: existing !== undefined,
            guardianLinked: guardianPersonId !== null,
          },
          ['status', 'memberNumber', 'linkedExistingPerson', 'guardianLinked'],
        ),
        ipAddress: ip,
      },
      transaction,
    );

    return {
      applicationId: id,
      memberId,
      memberNumber,
      memberCode: formatMemberCode(record.congregationCode, memberNumber),
    };
  }

  /** A minor needs a complete guardian; an adult never has one. */
  private requireGuardian(
    record: ApplicationRecord,
    today: string,
  ): ApplicationGuardian | null {
    if (!isMinorOn(record.birthDate, today)) {
      return null;
    }
    const guardian = record.formData.guardian;
    if (!guardian) {
      throw new BusinessRuleException(
        'Un menor de edad necesita un acudiente con nombre y documento en la autorización de datos.',
        'GUARDIAN_REQUIRED',
      );
    }
    return guardian;
  }

  /**
   * The person of the denomination holding the document of the application, after checking that the
   * reviewer's decision (link or not) is coherent with it and that its member state allows joining.
   */
  private async resolveExistingPerson(
    scope: TenantScope,
    ref: DocumentRef,
    input: ApproveApplicationInput,
    transaction: Transaction,
  ): Promise<ExistingPerson | undefined> {
    const existing = (
      await this.registry.findPeopleByDocuments(scope, [ref], transaction)
    ).find((person) => sameDocument(person, ref));

    if (!existing) {
      if (input.linkToPersonId !== null) {
        throw invalidMatch();
      }
      return undefined;
    }
    if (input.linkToPersonId === null) {
      throw duplicateDocument();
    }
    if (input.linkToPersonId !== existing.id) {
      throw invalidMatch();
    }
    if (existing.member?.status === 'ACTIVE') {
      throw new ConflictDomainException(
        'Esa persona ya es miembro activo. No se puede crear otro registro de membresía.',
        'ALREADY_MEMBER',
      );
    }
    if (existing.member?.status === 'DECEASED') {
      throw new BusinessRuleException(
        'Esa persona figura como fallecida y no puede ser readmitida.',
        'MEMBER_DECEASED',
      );
    }
    return existing;
  }

  private isSamePerson(
    guardian: ApplicationGuardian,
    ref: DocumentRef,
  ): boolean {
    return (
      guardian.documentTypeCode === ref.documentTypeCode &&
      normalizeDocumentNumber(guardian.documentNumber) === ref.documentNumber
    );
  }

  /** The guardian is reused when the denomination already knows the document, otherwise created. */
  private async ensureGuardian(
    scope: TenantScope,
    guardian: ApplicationGuardian,
    transaction: Transaction,
  ): Promise<number> {
    const ref: DocumentRef = {
      documentTypeCode: guardian.documentTypeCode,
      documentNumber: normalizeDocumentNumber(guardian.documentNumber),
    };
    const found = (
      await this.registry.findPeopleByDocuments(scope, [ref], transaction)
    ).find((person) => sameDocument(person, ref));
    if (found) {
      return found.id;
    }
    return this.registry.createPerson(
      scope,
      {
        ...ref,
        firstName: guardian.firstName,
        lastName: guardian.lastName,
        secondLastName: null,
        sex: null,
        birthDate: null,
        maritalStatusCode: null,
        occupation: null,
        phone: guardian.phone || null,
        email: null,
        address: null,
        municipalityCode: null,
        neighborhood: null,
      },
      transaction,
    );
  }

  private personDataOf(
    record: ApplicationRecord,
    ref: DocumentRef,
  ): PersonData {
    const { formData } = record;
    return {
      documentTypeCode: ref.documentTypeCode,
      documentNumber: ref.documentNumber,
      firstName: record.firstName,
      lastName: record.lastName,
      secondLastName: formData.secondLastName,
      sex: formData.sex,
      birthDate: record.birthDate,
      maritalStatusCode: formData.maritalStatusCode || null,
      occupation: formData.occupation,
      phone: record.phone,
      email: record.email,
      address: formData.address || null,
      municipalityCode: formData.municipalityCode || null,
      neighborhood: formData.neighborhood,
      documentIssuePlaceCode: formData.documentIssuePlaceCode ?? null,
      birthPlaceCode: formData.birthPlaceCode ?? null,
      educationLevelCode: formData.educationLevelCode ?? null,
      profession: formData.profession ?? null,
      workplace: formData.workplace ?? null,
      childrenCount: formData.childrenCount ?? null,
      landlinePhone: formData.landlinePhone ?? null,
      workPhone: formData.workPhone ?? null,
      fatherFullName: formData.fatherFullName ?? null,
      motherFullName: formData.motherFullName ?? null,
      childrenNames: formData.childrenNames ?? null,
      spouseFullName: formData.spouseFullName ?? null,
      marriageIsCivil: formData.marriageIsCivil ?? false,
      marriageIsChristian: formData.marriageIsChristian ?? false,
      marriageIsCatholic: formData.marriageIsCatholic ?? false,
      passedEcclesiasticalTribunal:
        formData.passedEcclesiasticalTribunal ?? null,
      tribunalOpinion: formData.tribunalOpinion ?? null,
    };
  }
}
