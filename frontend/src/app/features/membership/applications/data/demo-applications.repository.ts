import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { DOCUMENT_TYPES } from '../../../../core/models/catalogs';
import {
  DataConsent,
  Member,
  MemberRegistryEntry,
  MembershipApplication,
  Person,
  ageOn,
  personFullName,
} from '../../../../core/models/membership.model';
import {
  ADULT_AGE,
  APPLICATION_FILTERS,
  APPLICATION_FILTER_STATUSES,
  ApplicationCounts,
  ApplicationDetail,
  ApplicationFilter,
  ApplicationQueue,
  ApplicationSummary,
  ApprovalResult,
  PersonMatch,
  REJECTION_REASON_MAX_LENGTH,
  isReviewable,
  todayIsoDate,
} from './applications.models';
import { ApplicationsRepository } from './applications.repository';

const ENTITY = 'MembershipApplication';
const MEMBERS_PER_REGISTRY_BOOK = 100;

/**
 * Demo adapter: simulates the API over the shared in-memory database. It applies the tenant of
 * the session (sede, or every sede of the denomination when none is selected), the permission
 * `applications.review` and the review rules of C-03/C-04.
 */
@Injectable()
export class DemoApplicationsRepository extends ApplicationsRepository {
  private readonly db = inject(DemoDatabase);
  private readonly auth = inject(AuthService);

  list(filter: ApplicationFilter): Observable<ApplicationQueue> {
    return demoCommand(() => {
      this.requireReviewPermission('consultar las solicitudes');
      const visible = this.visibleApplications().sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      const statuses = APPLICATION_FILTER_STATUSES[filter];
      return {
        items: visible
          .filter((app) => statuses.includes(app.status))
          .map((app) => this.toSummary(app)),
        counts: countByFilter(visible),
      };
    });
  }

  get(id: number): Observable<ApplicationDetail> {
    return demoCommand(() => {
      this.requireReviewPermission('consultar las solicitudes');
      return this.toDetail(this.findVisible(id));
    });
  }

  startReview(id: number): Observable<ApplicationDetail> {
    return demoCommand(() => {
      this.requireReviewPermission('revisar solicitudes');
      const application = this.findVisible(id);
      if (application.status !== 'PENDING') {
        throw new DomainError(
          'INVALID_TRANSITION',
          'Solo una solicitud pendiente puede tomarse en revisión.',
        );
      }
      const updated = this.save(application, {
        status: 'IN_REVIEW',
        reviewerId: this.reviewerId(),
      });
      this.auditStatusChange(application, updated, 'APPLICATION_REVIEW_STARTED');
      return this.toDetail(updated);
    });
  }

  reject(id: number, reason: string): Observable<ApplicationDetail> {
    return demoCommand(() => {
      this.requireReviewPermission('rechazar solicitudes');
      const application = this.findReviewable(id);
      const rejectionReason = reason.trim();
      if (rejectionReason === '') {
        throw new DomainError('REJECTION_REASON_REQUIRED', 'Escribe el motivo del rechazo.');
      }
      if (rejectionReason.length > REJECTION_REASON_MAX_LENGTH) {
        throw new DomainError(
          'REJECTION_REASON_TOO_LONG',
          `El motivo del rechazo admite máximo ${REJECTION_REASON_MAX_LENGTH} caracteres.`,
        );
      }
      const updated = this.save(application, {
        status: 'REJECTED',
        rejectionReason,
        reviewerId: this.reviewerId(),
        reviewedAt: new Date().toISOString(),
      });
      this.auditStatusChange(application, updated, 'APPLICATION_REJECTED');
      return this.toDetail(updated);
    });
  }

  markDuplicate(id: number, matchedPersonId: number): Observable<ApplicationDetail> {
    return demoCommand(() => {
      this.requireReviewPermission('marcar solicitudes como duplicadas');
      const application = this.findReviewable(id);
      const match = this.findPersonWithSameDocument(application);
      if (!match || match.id !== matchedPersonId) {
        throw new DomainError(
          'INVALID_MATCH',
          'La persona indicada no coincide con el documento de la solicitud.',
        );
      }
      const updated = this.save(application, {
        status: 'DUPLICATE',
        matchedPersonId,
        reviewerId: this.reviewerId(),
        reviewedAt: new Date().toISOString(),
      });
      this.auditStatusChange(application, updated, 'APPLICATION_MARKED_DUPLICATE');
      return this.toDetail(updated);
    });
  }

  approve(id: number): Observable<ApprovalResult> {
    return demoCommand(() => {
      // 1. Validate everything before writing, like the API transaction.
      this.requireReviewPermission('aprobar solicitudes');
      const application = this.findReviewable(id);
      // @@unique([denominationId, documentTypeId, documentNumber]) on Person: never bypassable.
      if (this.findPersonWithSameDocument(application)) {
        throw new DomainError(
          'DUPLICATE_DOCUMENT',
          'Ya existe una persona con este documento en la denominación. Márcala como duplicada o rechaza la solicitud para que se corrija el documento.',
        );
      }
      const guardianData = isMinor(application) ? guardianFrom(application) : null;
      if (isMinor(application) && !guardianData) {
        throw new DomainError(
          'GUARDIAN_REQUIRED',
          'Un menor de edad necesita un acudiente con nombre y documento en la autorización de datos.',
        );
      }
      const congregation = this.db.congregation(application.congregationId);
      if (!congregation || congregation.denominationId !== application.denominationId) {
        throw new DomainError(
          'INVALID_CONGREGATION',
          'La sede de la solicitud no está disponible.',
        );
      }
      const policy = this.db.privacyPolicies.find(
        (item) =>
          item.id === application.policyId && item.denominationId === application.denominationId,
      );
      if (!policy) {
        throw new DomainError(
          'POLICY_NOT_FOUND',
          'No se encontró la política de datos aceptada por el solicitante.',
        );
      }

      // 2. Build every row, then write them together.
      const today = todayIsoDate();
      const now = new Date().toISOString();
      const person = this.personFrom(application);
      const existingGuardian = guardianData ? this.findGuardian(application, guardianData) : undefined;
      const newGuardian =
        guardianData && !existingGuardian
          ? this.guardianPersonFrom(application, guardianData, person.id + 1)
          : null;
      const guardianId = existingGuardian?.id ?? newGuardian?.id ?? null;
      const member: Member = {
        id: this.db.nextId(this.db.members),
        denominationId: application.denominationId,
        personId: person.id,
        congregationId: application.congregationId,
        status: 'ACTIVE',
        joinedOn: today,
        isBaptized: null,
        waterBaptismOn: null,
        previousCongregationName: application.formData.previousCongregationName,
      };
      const memberNumber = this.nextMemberNumber(application.congregationId);
      const registryEntry: MemberRegistryEntry = {
        id: this.db.nextId(this.db.memberRegistryEntries),
        denominationId: application.denominationId,
        memberId: member.id,
        congregationId: application.congregationId,
        memberNumber,
        registryBook: String(1 + Math.floor(memberNumber / MEMBERS_PER_REGISTRY_BOOK)),
        registryFolio: String((memberNumber % MEMBERS_PER_REGISTRY_BOOK) + 1),
        startedOn: today,
        endedOn: null,
      };
      const consent: DataConsent = {
        id: this.db.nextId(this.db.dataConsents),
        denominationId: application.denominationId,
        personId: person.id,
        guardianId,
        policyId: policy.id,
        channel: 'WEB_FORM',
        grantedAt: application.consentedAt,
        revokedAt: null,
      };

      this.db.persons.push(person);
      if (newGuardian) {
        this.db.persons.push(newGuardian);
      }
      this.db.members.push(member);
      this.db.memberRegistryEntries.push(registryEntry);
      this.db.dataConsents.push(consent);
      this.save(application, {
        status: 'APPROVED',
        memberId: member.id,
        matchedPersonId: null,
        reviewerId: this.reviewerId(),
        reviewedAt: now,
      });
      this.db.audit({
        userId: this.reviewerId(),
        denominationId: application.denominationId,
        congregationId: application.congregationId,
        entity: ENTITY,
        entityId: String(application.id),
        action: 'APPLICATION_APPROVED',
        changes: {
          status: { from: application.status, to: 'APPROVED' },
          memberNumber: { from: null, to: memberNumber },
          ...(guardianId !== null ? { guardianLinked: { from: null, to: true } } : {}),
        },
      });

      return {
        applicationId: application.id,
        memberId: member.id,
        memberNumber,
        memberCode: this.db.memberCode(member.id),
      };
    });
  }

  private requireReviewPermission(action: string): void {
    if (!this.auth.can('applications.review')) {
      throw new DomainError('FORBIDDEN', `No tienes permiso para ${action}.`);
    }
  }

  private reviewerId(): number | null {
    return this.auth.user()?.id ?? null;
  }

  /** Applications of the active sede, or of every sede of the denomination. */
  private visibleApplications(): MembershipApplication[] {
    const { denominationId, congregationId } = this.auth.tenant();
    if (denominationId === null) {
      return [];
    }
    return this.db.membershipApplications.filter(
      (app) =>
        app.denominationId === denominationId &&
        (congregationId === null || app.congregationId === congregationId),
    );
  }

  private findVisible(id: number): MembershipApplication {
    const application = this.visibleApplications().find((app) => app.id === id);
    if (!application) {
      throw new DomainError('NOT_FOUND', 'La solicitud no existe o no pertenece a tu sede.');
    }
    return application;
  }

  private findReviewable(id: number): MembershipApplication {
    const application = this.findVisible(id);
    if (!isReviewable(application.status)) {
      throw new DomainError(
        'INVALID_TRANSITION',
        'La solicitud ya fue resuelta y no admite cambios.',
      );
    }
    return application;
  }

  /** C-03: a person of the SAME denomination with the same document type and number. */
  private findPersonWithSameDocument(application: MembershipApplication): Person | undefined {
    const number = normalizeDocument(application.documentNumber);
    if (!application.documentTypeCode || number === '') {
      return undefined;
    }
    return this.db.persons.find(
      (person) =>
        person.denominationId === application.denominationId &&
        person.documentTypeCode === application.documentTypeCode &&
        normalizeDocument(person.documentNumber) === number,
    );
  }

  /** Guardian already registered in the denomination with the same document. */
  private findGuardian(
    application: MembershipApplication,
    guardian: GuardianData,
  ): Person | undefined {
    if (!guardian.documentTypeCode) {
      return undefined;
    }
    const number = normalizeDocument(guardian.documentNumber);
    return this.db.persons.find(
      (person) =>
        person.denominationId === application.denominationId &&
        person.documentTypeCode === guardian.documentTypeCode &&
        normalizeDocument(person.documentNumber) === number,
    );
  }

  private guardianPersonFrom(
    application: MembershipApplication,
    guardian: GuardianData,
    id: number,
  ): Person {
    const [firstName, ...lastNames] = guardian.name.split(/\s+/);
    return {
      id,
      denominationId: application.denominationId,
      userId: null,
      documentTypeCode: guardian.documentTypeCode,
      documentNumber: guardian.documentNumber,
      firstName,
      lastName: lastNames.join(' '),
      secondLastName: null,
      sex: null,
      birthDate: null,
      maritalStatusCode: null,
      educationLevelCode: null,
      profession: null,
      occupation: null,
      phone: application.formData.guardianPhone,
      email: null,
      address: null,
      municipalityCode: null,
    };
  }

  private nextMemberNumber(congregationId: number): number {
    return (
      this.db.memberRegistryEntries
        .filter((entry) => entry.congregationId === congregationId)
        .reduce((max, entry) => Math.max(max, entry.memberNumber), 0) + 1
    );
  }

  private personFrom(application: MembershipApplication): Person {
    const { formData } = application;
    return {
      id: this.db.nextId(this.db.persons),
      denominationId: application.denominationId,
      userId: null,
      documentTypeCode: application.documentTypeCode,
      documentNumber: application.documentNumber,
      firstName: application.firstName,
      lastName: application.lastName,
      secondLastName: formData.secondLastName,
      sex: formData.sex,
      birthDate: application.birthDate,
      maritalStatusCode: formData.maritalStatusCode,
      educationLevelCode: null,
      profession: null,
      occupation: null,
      phone: application.phone,
      email: application.email,
      address: formData.address,
      municipalityCode: formData.municipalityCode,
    };
  }

  private save(
    application: MembershipApplication,
    changes: Partial<MembershipApplication>,
  ): MembershipApplication {
    return this.db.replace(this.db.membershipApplications, { ...application, ...changes });
  }

  private auditStatusChange(
    before: MembershipApplication,
    after: MembershipApplication,
    action: string,
  ): void {
    this.db.audit({
      userId: this.reviewerId(),
      denominationId: after.denominationId,
      congregationId: after.congregationId,
      entity: ENTITY,
      entityId: String(after.id),
      action,
      changes: { status: { from: before.status, to: after.status } },
    });
  }

  private toSummary(application: MembershipApplication): ApplicationSummary {
    return {
      id: application.id,
      congregationId: application.congregationId,
      congregationName: this.db.congregation(application.congregationId)?.name ?? '—',
      status: application.status,
      fullName: applicantName(application),
      documentTypeCode: application.documentTypeCode,
      documentNumber: application.documentNumber,
      createdAt: application.createdAt,
      isMinor: isMinor(application),
      hasDuplicateMatch:
        isReviewable(application.status) && !!this.findPersonWithSameDocument(application),
    };
  }

  private toDetail(application: MembershipApplication): ApplicationDetail {
    const duplicate = isReviewable(application.status)
      ? this.findPersonWithSameDocument(application)
      : undefined;
    const linked =
      application.status === 'DUPLICATE' && application.matchedPersonId !== null
        ? this.db.person(application.matchedPersonId)
        : undefined;
    return {
      id: application.id,
      congregationId: application.congregationId,
      congregationName: this.db.congregation(application.congregationId)?.name ?? '—',
      status: application.status,
      trackingCode: application.trackingCode,
      documentTypeCode: application.documentTypeCode,
      documentNumber: application.documentNumber,
      firstName: application.firstName,
      lastName: application.lastName,
      fullName: applicantName(application),
      email: application.email,
      phone: application.phone,
      birthDate: application.birthDate,
      age: ageOn(application.birthDate, todayIsoDate()),
      isMinor: isMinor(application),
      guardianName: application.guardianName,
      guardianDocument: application.guardianDocument,
      formData: application.formData,
      policyVersion:
        this.db.privacyPolicies.find((policy) => policy.id === application.policyId)?.version ??
        null,
      consentedAt: application.consentedAt,
      createdAt: application.createdAt,
      reviewerName:
        this.db.users.find((user) => user.id === application.reviewerId)?.displayName ?? null,
      reviewedAt: application.reviewedAt,
      rejectionReason: application.rejectionReason,
      duplicateMatch: duplicate ? this.toPersonMatch(duplicate) : null,
      linkedPerson: linked ? this.toPersonMatch(linked) : null,
      memberId: application.memberId,
      memberCode: application.memberId !== null ? this.db.memberCode(application.memberId) : null,
    };
  }

  private toPersonMatch(person: Person): PersonMatch {
    const member = this.db.members.find((item) => item.personId === person.id);
    return {
      personId: person.id,
      fullName: personFullName(person),
      documentTypeCode: person.documentTypeCode,
      documentNumber: person.documentNumber,
      congregationName: member ? (this.db.congregation(member.congregationId)?.name ?? null) : null,
      memberId: member?.id ?? null,
      memberCode: member ? this.db.memberCode(member.id) : null,
      memberStatus: member?.status ?? null,
    };
  }
}

function countByFilter(applications: readonly MembershipApplication[]): ApplicationCounts {
  const counts = Object.fromEntries(APPLICATION_FILTERS.map((filter) => [filter, 0])) as Record<
    ApplicationFilter,
    number
  >;
  for (const application of applications) {
    for (const filter of APPLICATION_FILTERS) {
      if (APPLICATION_FILTER_STATUSES[filter].includes(application.status)) {
        counts[filter] += 1;
      }
    }
  }
  return counts;
}

function applicantName(application: MembershipApplication): string {
  return personFullName({
    firstName: application.firstName,
    lastName: application.lastName,
    secondLastName: application.formData.secondLastName,
  });
}

function isMinor(application: MembershipApplication): boolean {
  const age = ageOn(application.birthDate, todayIsoDate());
  return (age !== null && age < ADULT_AGE) || application.guardianName !== null;
}

interface GuardianData {
  readonly name: string;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string;
}

/**
 * Guardian typed in the public form ("CC 52345678"), or null when the name or the document is
 * missing. A leading known document type is split from the number.
 */
function guardianFrom(application: MembershipApplication): GuardianData | null {
  const name = (application.guardianName ?? '').trim().replace(/\s+/g, ' ');
  const document = (application.guardianDocument ?? '').trim();
  if (name === '' || document === '') {
    return null;
  }
  const [first, ...rest] = document.split(/\s+/);
  const type = DOCUMENT_TYPES.find((entry) => entry.code === first.toUpperCase());
  if (type && rest.length > 0) {
    return { name, documentTypeCode: type.code, documentNumber: rest.join('') };
  }
  return { name, documentTypeCode: null, documentNumber: document };
}

/** Ignores dots, spaces and dashes typed in the form ("1.023.456.789"). */
function normalizeDocument(value: string | null): string {
  return (value ?? '').replace(/[\s.\-]/g, '').toUpperCase();
}
