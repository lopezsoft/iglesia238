import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { DEMO_MUNICIPALITIES, DOCUMENT_TYPES, MARITAL_STATUSES } from '../../../../core/models/catalogs';
import {
  APPLICATION_STATUS_LABELS,
  MembershipApplication,
  PrivacyPolicy,
  ageOn,
} from '../../../../core/models/membership.model';
import { Congregation } from '../../../../core/models/organization.model';
import {
  ADULT_AGE,
  ApplicationStatusCheck,
  ApplicationSubmission,
  CurrentPrivacyPolicy,
  MAX_SUBMISSIONS_PER_SESSION,
  OpenCongregation,
  SubmissionReceipt,
  todayIso,
} from './public-application.models';
import { PublicApplicationRepository } from './public-application.repository';
import { generateTrackingCode, normalizeTrackingCode } from './tracking-code';

const SUBMISSIONS_STORAGE_KEY = 'iglesia238.demo.publicSubmissions';
const NOT_FOUND_MESSAGE = 'No encontramos una solicitud con ese código.';

/**
 * ADAPTER simulating the anonymous endpoints of the API. It applies the server rules (open
 * congregation, current policy, consent, guardian of minors, rate limit, honeypot) and never
 * returns personal data of an application.
 */
@Injectable()
export class DemoPublicApplicationRepository extends PublicApplicationRepository {
  private readonly db = inject(DemoDatabase);
  /** Fallback counter when sessionStorage is blocked. */
  private memorySubmissions = 0;

  listOpenCongregations(): Observable<OpenCongregation[]> {
    return demoCommand(() =>
      this.db.congregations
        .filter((congregation) => this.isOpen(congregation))
        .map((congregation) => this.toOpenCongregation(congregation)),
    );
  }

  getCurrentPolicy(denominationId: number): Observable<CurrentPrivacyPolicy> {
    return demoCommand(() => {
      const policy = this.currentPolicy(denominationId);
      if (!policy) {
        throw new DomainError('NOT_FOUND', 'Esta denominación aún no publica su política de tratamiento de datos.');
      }
      return { ...policy };
    });
  }

  submit(input: ApplicationSubmission): Observable<SubmissionReceipt> {
    return demoCommand(() => {
      if (this.submissionCount() >= MAX_SUBMISSIONS_PER_SESSION) {
        throw new DomainError('TOO_MANY_REQUESTS', 'Has enviado varias solicitudes. Intenta más tarde.');
      }
      const congregation = this.db.congregation(input.congregationId);
      if (!congregation || !this.isOpen(congregation)) {
        throw new DomainError('CONGREGATION_CLOSED', 'La sede elegida no está recibiendo solicitudes.');
      }
      const denominationName = this.denominationName(congregation.denominationId);

      // A bot filled the hidden field: answer like a success, store nothing.
      if (input.website.trim() !== '') {
        this.registerSubmission();
        return { trackingCode: generateTrackingCode(denominationName) };
      }

      const policy = this.currentPolicy(congregation.denominationId);
      if (!policy || policy.id !== input.policyId) {
        throw new DomainError(
          'POLICY_OUTDATED',
          'La política de tratamiento de datos cambió. Vuelve a leerla y acéptala para continuar.',
        );
      }
      if (!input.consentAccepted) {
        throw new DomainError(
          'CONSENT_REQUIRED',
          'Debes aceptar la política de tratamiento de datos para enviar la solicitud.',
        );
      }
      assertValidApplicant(input);

      const today = todayIso();
      const age = ageOn(input.birthDate, today);
      const isMinor = age !== null && age < ADULT_AGE;
      if (isMinor && !hasCompleteGuardian(input)) {
        throw new DomainError(
          'GUARDIAN_REQUIRED',
          'Como el solicitante es menor de edad, los datos completos del acudiente son obligatorios.',
        );
      }

      const now = new Date().toISOString();
      const guardian = isMinor ? input.guardian : null;
      const application: MembershipApplication = {
        id: this.db.nextId(this.db.membershipApplications),
        denominationId: congregation.denominationId,
        congregationId: congregation.id,
        policyId: policy.id,
        trackingCode: this.uniqueTrackingCode(denominationName),
        status: 'PENDING',
        documentTypeCode: input.documentTypeCode,
        documentNumber: input.documentNumber.trim(),
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email?.trim() || null,
        phone: input.phone.trim(),
        birthDate: input.birthDate,
        guardianName: guardian?.name.trim() ?? null,
        guardianDocument: guardian?.document.trim() ?? null,
        formData: {
          secondLastName: input.secondLastName?.trim() || null,
          sex: input.sex,
          maritalStatusCode: input.maritalStatusCode,
          address: input.address.trim(),
          municipalityCode: input.municipalityCode,
          guardianRelationship: guardian?.relationship ?? null,
          guardianPhone: guardian?.phone.trim() ?? null,
          previousCongregationName: null,
        },
        consentedAt: now,
        reviewerId: null,
        reviewedAt: null,
        rejectionReason: null,
        matchedPersonId: null,
        memberId: null,
        createdAt: now,
      };
      this.db.membershipApplications.push(application);
      this.db.audit({
        userId: null,
        denominationId: application.denominationId,
        congregationId: application.congregationId,
        entity: 'MembershipApplication',
        entityId: String(application.id),
        action: 'APPLICATION_SUBMITTED',
        changes: { status: { from: null, to: 'PENDING' }, policyId: { from: null, to: policy.id } },
      });
      this.registerSubmission();
      return { trackingCode: application.trackingCode };
    });
  }

  checkStatus(trackingCode: string): Observable<ApplicationStatusCheck> {
    return demoCommand(() => {
      const code = normalizeTrackingCode(trackingCode);
      const application = this.db.membershipApplications.find((item) => item.trackingCode === code);
      if (!code || !application) {
        throw new DomainError('NOT_FOUND', NOT_FOUND_MESSAGE);
      }
      // Explicit projection: nothing else of the application leaves the "server".
      return {
        status: application.status,
        statusLabel: APPLICATION_STATUS_LABELS[application.status],
        submittedOn: application.createdAt,
        reviewedOn: application.reviewedAt,
      };
    });
  }

  private isOpen(congregation: Congregation): boolean {
    const denomination = this.db.denominations.find((item) => item.id === congregation.denominationId);
    return congregation.isActive && congregation.acceptsApplications && denomination?.isActive === true;
  }

  private toOpenCongregation(congregation: Congregation): OpenCongregation {
    return {
      id: congregation.id,
      denominationId: congregation.denominationId,
      denominationName: this.denominationName(congregation.denominationId),
      name: congregation.name,
      municipalityCode: congregation.municipalityCode,
      neighborhood: congregation.neighborhood,
      address: congregation.address,
    };
  }

  private denominationName(denominationId: number): string {
    return this.db.denominations.find((item) => item.id === denominationId)?.name ?? '';
  }

  /** Latest policy already in force for the denomination. */
  private currentPolicy(denominationId: number): PrivacyPolicy | undefined {
    const today = todayIso();
    return this.db.privacyPolicies
      .filter((policy) => policy.denominationId === denominationId && policy.effectiveFrom <= today)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id - a.id)[0];
  }

  private uniqueTrackingCode(denominationName: string): string {
    const taken = new Set(this.db.membershipApplications.map((item) => item.trackingCode));
    let code = generateTrackingCode(denominationName);
    while (taken.has(code)) {
      code = generateTrackingCode(denominationName);
    }
    return code;
  }

  private submissionCount(): number {
    try {
      const stored = Number(sessionStorage.getItem(SUBMISSIONS_STORAGE_KEY) ?? '0');
      return Math.max(Number.isFinite(stored) ? stored : 0, this.memorySubmissions);
    } catch {
      return this.memorySubmissions;
    }
  }

  private registerSubmission(): void {
    this.memorySubmissions = this.submissionCount() + 1;
    try {
      sessionStorage.setItem(SUBMISSIONS_STORAGE_KEY, String(this.memorySubmissions));
    } catch {
      // Storage blocked: the in-memory counter still limits this page.
    }
  }
}

const INVALID_APPLICATION = 'Revisa los datos de la solicitud: hay campos obligatorios vacíos o inválidos.';
const DOCUMENT_NUMBER = /^[A-Za-z0-9]{3,20}$/;
const PHONE = /^[0-9+\s-]{7,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertValidApplicant(input: ApplicationSubmission): void {
  const today = todayIso();
  const age = ageOn(input.birthDate, today);
  const valid =
    isFilled(input.firstName, 80) &&
    isFilled(input.lastName, 80) &&
    (input.secondLastName === null || input.secondLastName.length <= 80) &&
    DOCUMENT_TYPES.some((type) => type.code === input.documentTypeCode) &&
    DOCUMENT_NUMBER.test(input.documentNumber.trim()) &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.birthDate) &&
    input.birthDate <= today &&
    age !== null &&
    age <= 120 &&
    (input.sex === 'FEMALE' || input.sex === 'MALE') &&
    MARITAL_STATUSES.some((status) => status.code === input.maritalStatusCode) &&
    PHONE.test(input.phone.trim()) &&
    (input.email === null || input.email.trim() === '' || EMAIL.test(input.email.trim())) &&
    isFilled(input.address, 120) &&
    DEMO_MUNICIPALITIES.some((municipality) => municipality.code === input.municipalityCode);
  if (!valid) {
    throw new DomainError('INVALID_APPLICATION', INVALID_APPLICATION);
  }
}

function hasCompleteGuardian(input: ApplicationSubmission): boolean {
  const guardian = input.guardian;
  return (
    guardian !== null &&
    isFilled(guardian.name, 120) &&
    isFilled(guardian.document, 30) &&
    isFilled(guardian.relationship, 40) &&
    PHONE.test(guardian.phone.trim())
  );
}

function isFilled(value: string, maxLength: number): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength;
}
