import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
  ConflictDomainException,
} from '../../../common/errors/domain.exception.js';
import { SmartLogger } from '../../../common/logging/smart-logger.service.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import {
  ADULT_AGE,
  ageOn,
  MAX_PLAUSIBLE_AGE,
} from '../../../common/people/age.js';
import { normalizeDocumentNumber } from '../../../common/people/document-number.js';
import { composeFullName } from '../../../common/people/full-name.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import { Clock } from '../../../common/time/bogota-time.js';
import type { ApplicationFormData } from '../../membership-applications/domain/application-form-data.js';
import {
  generateTrackingCode,
  hashTrackingCode,
} from '../../membership-applications/domain/tracking-code.js';
import {
  PUBLIC_APPLICATIONS_STORE,
  type PublicApplicationsStore,
} from './ports/public-applications.store.js';
import {
  PUBLIC_DIRECTORY,
  type PublicDirectory,
} from './ports/public-directory.reader.js';

export interface GuardianInput {
  firstName: string;
  lastName: string;
  documentTypeCode: string;
  documentNumber: string;
  relationship: string;
  phone: string;
}

export interface SubmitApplicationInput {
  congregationId: number;
  policyId: number;
  firstName: string;
  lastName: string;
  secondLastName: string | null;
  documentTypeCode: string;
  documentNumber: string;
  /** YYYY-MM-DD */
  birthDate: string;
  sex: 'FEMALE' | 'MALE';
  maritalStatusCode: string;
  phone: string;
  email: string | null;
  address: string;
  municipalityCode: string;
  neighborhood: string | null;
  occupation: string | null;
  previousCongregationName: string | null;
  isBaptized: boolean | null;
  guardian: GuardianInput | null;
  consentAccepted: boolean;
  /** Honeypot: hidden field that only bots fill in. */
  website: string | null;
  documentIssuePlaceCode?: string | null;
  birthPlaceCode?: string | null;
  landlinePhone?: string | null;
  educationLevelCode?: string | null;
  profession?: string | null;
  workplace?: string | null;
  workPhone?: string | null;
  marriageIsCivil?: boolean;
  marriageIsChristian?: boolean;
  marriageIsCatholic?: boolean;
  spouseFullName?: string | null;
  passedEcclesiasticalTribunal?: boolean | null;
  tribunalOpinion?: string | null;
  fatherFullName?: string | null;
  motherFullName?: string | null;
  childrenCount?: number | null;
  childrenNames?: string | null;
  convertedOn?: string | null;
  waterBaptismOn?: string | null;
  baptismMunicipalityCode?: string | null;
  baptismPlace?: string | null;
  baptizingPastorName?: string | null;
  holySpiritBaptismOn?: string | null;
  reconciledOn?: string | null;
  previousCongregationId?: number | null;
  pastPositionsText?: string | null;
  currentPositionsText?: string | null;
  desiredAreas?: string | null;
  isChristianEducationTeacher?: boolean;
}

export interface SubmissionReceipt {
  trackingCode: string;
}

const MAX_CODE_ATTEMPTS = 5;

const invalid = (message: string, code: string) =>
  new BusinessRuleException(message, code);

/**
 * Public form: stores a PENDING application. The tenant comes from the chosen congregation, never from
 * the client; the applicant gets a tracking code that is stored only as a hash.
 */
@Injectable()
export class SubmitApplicationUseCase {
  constructor(
    @Inject(PUBLIC_DIRECTORY) private readonly directory: PublicDirectory,
    @Inject(PUBLIC_APPLICATIONS_STORE)
    private readonly store: PublicApplicationsStore,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
    private readonly logger: SmartLogger,
  ) {}

  async execute(
    input: SubmitApplicationInput,
    ip: string | null,
  ): Promise<SubmissionReceipt> {
    // A bot that fills the hidden field gets a believable receipt and nothing is stored.
    if (input.website !== null && input.website.trim() !== '') {
      this.logger.warn(
        'Public application discarded by the honeypot',
        SubmitApplicationUseCase.name,
      );
      return { trackingCode: generateTrackingCode() };
    }

    if (!input.consentAccepted) {
      throw invalid(
        'Debes aceptar la política de tratamiento de datos para enviar la solicitud.',
        'CONSENT_REQUIRED',
      );
    }

    const today = this.clock.today();
    const age = this.ageOf(input.birthDate, today);

    const congregation = await this.directory.findOpenCongregation(
      input.congregationId,
    );
    if (!congregation) {
      throw new ConflictDomainException(
        'La sede elegida ya no está recibiendo solicitudes.',
        'CONGREGATION_CLOSED',
      );
    }

    const policy = await this.directory.findCurrentPolicy(
      congregation.denominationId,
      today,
    );
    if (!policy) {
      throw new ConflictDomainException(
        'La sede elegida no tiene una política de datos vigente. Intenta más tarde.',
        'POLICY_NOT_AVAILABLE',
      );
    }
    // The consent is evidence of what the person read: it must be the policy in force of THIS sede.
    if (policy.id !== input.policyId) {
      throw new ConflictDomainException(
        'La política de datos cambió. Léela de nuevo y acéptala para continuar.',
        'POLICY_OUTDATED',
      );
    }

    await this.assertCatalogs(input);

    const guardian = this.resolveGuardian(input, age);
    const formData: ApplicationFormData = {
      secondLastName: input.secondLastName,
      sex: input.sex,
      maritalStatusCode: input.maritalStatusCode,
      address: input.address,
      municipalityCode: input.municipalityCode,
      neighborhood: input.neighborhood,
      occupation: input.occupation,
      previousCongregationName: input.previousCongregationName,
      isBaptized: input.isBaptized,
      guardian,
      documentIssuePlaceCode: input.documentIssuePlaceCode ?? null,
      birthPlaceCode: input.birthPlaceCode ?? null,
      landlinePhone: input.landlinePhone ?? null,
      educationLevelCode: input.educationLevelCode ?? null,
      profession: input.profession ?? null,
      workplace: input.workplace ?? null,
      workPhone: input.workPhone ?? null,
      marriageIsCivil: input.marriageIsCivil ?? false,
      marriageIsChristian: input.marriageIsChristian ?? false,
      marriageIsCatholic: input.marriageIsCatholic ?? false,
      spouseFullName: input.spouseFullName ?? null,
      passedEcclesiasticalTribunal: input.passedEcclesiasticalTribunal ?? null,
      tribunalOpinion: input.tribunalOpinion ?? null,
      fatherFullName: input.fatherFullName ?? null,
      motherFullName: input.motherFullName ?? null,
      childrenCount: input.childrenCount ?? null,
      childrenNames: input.childrenNames ?? null,
      convertedOn: input.convertedOn ?? null,
      waterBaptismOn: input.waterBaptismOn ?? null,
      baptismMunicipalityCode: input.baptismMunicipalityCode ?? null,
      baptismPlace: input.baptismPlace ?? null,
      baptizingPastorName: input.baptizingPastorName ?? null,
      holySpiritBaptismOn: input.holySpiritBaptismOn ?? null,
      reconciledOn: input.reconciledOn ?? null,
      previousCongregationId: input.previousCongregationId ?? null,
      pastPositionsText: input.pastPositionsText ?? null,
      currentPositionsText: input.currentPositionsText ?? null,
      desiredAreas: input.desiredAreas ?? null,
      isChristianEducationTeacher: input.isChristianEducationTeacher ?? false,
    };

    const trackingCode = await this.freshTrackingCode();
    await this.transactions.run(async (transaction) => {
      const id = await this.store.create(
        {
          denominationId: congregation.denominationId,
          congregationId: congregation.id,
          policyId: policy.id,
          trackingCodeHash: hashTrackingCode(trackingCode),
          documentTypeCode: input.documentTypeCode,
          documentNumber: normalizeDocumentNumber(input.documentNumber),
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          birthDate: input.birthDate,
          guardianName: guardian
            ? composeFullName(guardian.firstName, guardian.lastName)
            : null,
          guardianDocument: guardian ? guardian.documentNumber : null,
          formData,
          consentedAt: this.clock.now(),
        },
        transaction,
      );
      // The IP is the evidence of where the consent was given (Ley 1581); the change set has no personal data.
      await this.audit.record(
        {
          action: 'APPLICATION_SUBMITTED',
          entity: 'MembershipApplication',
          entityId: id,
          actor: {
            userId: null,
            denominationId: congregation.denominationId,
            congregationId: congregation.id,
          },
          changes: { status: { from: null, to: 'PENDING' } },
          ipAddress: ip,
        },
        transaction,
      );
      return id;
    });

    return { trackingCode };
  }

  private ageOf(birthDate: string, today: string): number {
    if (!isIsoDate(birthDate) || birthDate > today) {
      throw invalid(
        'Revisa la fecha de nacimiento: no puede ser futura.',
        'INVALID_BIRTH_DATE',
      );
    }
    const age = ageOn(birthDate, today);
    if (age > MAX_PLAUSIBLE_AGE) {
      throw invalid(
        `Revisa la fecha de nacimiento: la edad no puede superar ${MAX_PLAUSIBLE_AGE} años.`,
        'INVALID_BIRTH_DATE',
      );
    }
    return age;
  }

  /** A minor needs a complete guardian; an adult's guardian data is ignored. */
  private resolveGuardian(
    input: SubmitApplicationInput,
    age: number,
  ): ApplicationFormData['guardian'] {
    if (age >= ADULT_AGE) {
      return null;
    }
    const guardian = input.guardian;
    if (!guardian) {
      throw invalid(
        'Como el solicitante es menor de edad, debes indicar los datos de su acudiente.',
        'GUARDIAN_REQUIRED',
      );
    }
    return {
      firstName: guardian.firstName,
      lastName: guardian.lastName,
      documentTypeCode: guardian.documentTypeCode,
      documentNumber: normalizeDocumentNumber(guardian.documentNumber),
      relationship: guardian.relationship,
      phone: guardian.phone,
    };
  }

  private async assertCatalogs(input: SubmitApplicationInput): Promise<void> {
    const checks: [Promise<boolean>, string][] = [
      [
        this.directory.documentTypeExists(input.documentTypeCode),
        'El tipo de documento no es válido.',
      ],
      [
        this.directory.maritalStatusExists(input.maritalStatusCode),
        'El estado civil no es válido.',
      ],
      [
        this.directory.municipalityExists(input.municipalityCode),
        'El municipio no es válido.',
      ],
    ];
    if (input.guardian) {
      checks.push([
        this.directory.documentTypeExists(input.guardian.documentTypeCode),
        'El tipo de documento del acudiente no es válido.',
      ]);
    }
    if (input.educationLevelCode && this.directory.educationLevelExists) {
      checks.push([
        this.directory.educationLevelExists(input.educationLevelCode),
        'El nivel educativo no es válido.',
      ]);
    }
    if (input.documentIssuePlaceCode) {
      checks.push([
        this.directory.municipalityExists(input.documentIssuePlaceCode),
        'El municipio de expedición del documento no es válido.',
      ]);
    }
    if (input.birthPlaceCode) {
      checks.push([
        this.directory.municipalityExists(input.birthPlaceCode),
        'El municipio de nacimiento no es válido.',
      ]);
    }
    if (input.baptismMunicipalityCode) {
      checks.push([
        this.directory.municipalityExists(input.baptismMunicipalityCode),
        'El municipio de bautismo no es válido.',
      ]);
    }
    for (const [check, message] of checks) {
      if (!(await check)) {
        throw invalid(message, 'INVALID_CATALOG_VALUE');
      }
    }
  }

  private async freshTrackingCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = generateTrackingCode();
      if (!(await this.store.trackingHashExists(hashTrackingCode(code)))) {
        return code;
      }
    }
    throw new ConflictDomainException(
      'No fue posible generar el código de seguimiento. Intenta de nuevo.',
      'TRACKING_CODE_UNAVAILABLE',
    );
  }
}
