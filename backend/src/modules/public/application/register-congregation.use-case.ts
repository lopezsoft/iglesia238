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
import { devLinkFor, EXPOSE_DEV_LINKS } from '../../../common/mail/dev-link.js';
import { MAILER, type Mailer } from '../../../common/mail/mailer.port.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import { RateLimitService } from '../../../common/rate-limit/rate-limit.service.js';
import { generateOpaqueToken } from '../../../common/security/opaque-token.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../common/security/password-hasher.port.js';
import { assertStrongPassword } from '../../../common/security/password-policy.js';
import { comparableText } from '../../../common/text/comparable-text.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  emailVerificationLink,
  emailVerificationMessage,
  registrationNoticeMessage,
} from '../../auth/application/auth-mail.js';
import { EMAIL_VERIFICATION_TOKEN_HOURS } from '../../auth/application/auth.policy.js';
import {
  FIELD_LIMITS,
  generateCongregationCode,
  municipalityCountryMismatch,
  optionalEmail,
  optionalText,
  requiredText,
} from '../../organization/application/organization-rules.js';
import {
  CONGREGATION_REGISTRATION_STORE,
  DuplicateRegistrationEmailError,
  type CongregationRegistrationStore,
  type RegistrationLegalEntity,
} from './ports/congregation-registration.store.js';
import {
  PUBLIC_REGISTRATION_SETTINGS,
  type PublicRegistrationSettings,
} from './public-registration.settings.js';

/** Roles the person who registers a sede receives on it: the three that run a congregation. */
export const REGISTRATION_ROLE_CODES = [
  'PASTOR',
  'SECRETARY',
  'TREASURER',
] as const;

/** Per client IP (see the controller) and per e-mail address. Both close when Redis is down. */
export const REGISTRATION_EMAIL_RATE = {
  limit: 3,
  windowSeconds: 60 * 60,
} as const;

export const DISPLAY_NAME_MIN_LENGTH = 3;
export const DISPLAY_NAME_MAX_LENGTH = 150;
const HOUR_MS = 3_600_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterCongregationInput {
  readonly legalEntityId: number;
  readonly congregation: {
    readonly name: string;
    /** Required: a code of the country of the legal entity. */
    readonly municipalityCode: string;
    readonly address: string | null;
    readonly phone: string | null;
    readonly email: string | null;
  };
  readonly manager: {
    readonly displayName: string;
    readonly email: string;
    readonly password: string;
  };
}

export interface RegistrationReceipt {
  readonly emailVerificationRequired: true;
  readonly congregationName: string;
  /** Only in development without SMTP (see devLinkFor). */
  readonly devVerificationLink?: string;
}

/**
 * Anyone can register a congregation under an existing legal entity and create their own user.
 * The congregation is active at once; the user signs in right away but cannot use the domain routes
 * until the e-mail is confirmed.
 *
 * Nothing in the answer, in the status or in the work done depends on whether the e-mail already has
 * an account: in that case nothing is created and the owner of the address is told by e-mail (without
 * links). Every check that does not depend on the e-mail (input, legal entity, municipality, sede
 * name) runs BEFORE that branch, so a rejection cannot be used to find out whether an address exists.
 */
@Injectable()
export class RegisterCongregationUseCase {
  constructor(
    @Inject(CONGREGATION_REGISTRATION_STORE)
    private readonly store: CongregationRegistrationStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(PUBLIC_REGISTRATION_SETTINGS)
    private readonly settings: PublicRegistrationSettings,
    @Inject(EXPOSE_DEV_LINKS) private readonly exposeDevLinks: boolean,
    private readonly rateLimit: RateLimitService,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RegisterCongregationInput,
    ipAddress: string | null,
  ): Promise<RegistrationReceipt> {
    const email = input.manager.email.trim().toLowerCase();
    // Closed: a registration creates accounts and sends e-mail, so without the counter nothing runs.
    await this.rateLimit.enforce(
      'public-congregation-registration-email',
      email,
      REGISTRATION_EMAIL_RATE,
      'closed',
    );

    const fields = this.validate(input, email);
    const legalEntity = await this.requireLegalEntity(input.legalEntityId);
    const municipalityId = await this.resolveMunicipality(
      legalEntity.countryId,
      fields.municipalityCode,
    );
    const identifiers = await this.store.listCongregationIdentifiers(
      legalEntity.denominationId,
    );
    if (
      identifiers.some(
        (row) => comparableText(row.name) === comparableText(fields.name),
      )
    ) {
      throw new ConflictDomainException(
        'Ya existe una sede con ese nombre en esta iglesia. Si es tu sede, pide acceso a quien la administra.',
        'DUPLICATE_NAME',
      );
    }

    // The same cost for both branches, so the response time does not tell them apart.
    const passwordHash = await this.hasher.hash(input.manager.password);

    if (await this.store.emailExists(email)) {
      return this.answerForExistingAccount(email, fields.name);
    }

    const code = generateCongregationCode(
      fields.name,
      new Set(identifiers.map((row) => row.code.toUpperCase())),
    );
    const opaque = generateOpaqueToken();
    const now = this.clock.now();

    try {
      await this.transactions.run(async (transaction) => {
        const created = await this.store.register(
          {
            congregation: {
              denominationId: legalEntity.denominationId,
              legalEntityId: legalEntity.id,
              name: fields.name,
              code,
              municipalityId,
              address: fields.address,
              phone: fields.phone,
              email: fields.congregationEmail,
            },
            manager: {
              email,
              displayName: fields.displayName,
              passwordHash,
            },
            roleCodes: REGISTRATION_ROLE_CODES,
            verification: {
              tokenHash: opaque.hash,
              expiresAt: new Date(
                now.getTime() + EMAIL_VERIFICATION_TOKEN_HOURS * HOUR_MS,
              ),
            },
          },
          transaction,
        );
        const actor = {
          userId: created.userId,
          denominationId: legalEntity.denominationId,
          congregationId: created.congregationId,
        };
        // No personal data in the trail: not the e-mail, not the person's name, not the contact data.
        await this.audit.record(
          {
            action: 'CONGREGATION_REGISTERED',
            entity: 'Congregation',
            entityId: created.congregationId,
            actor,
            changes: buildAuditChanges(
              null,
              {
                name: fields.name,
                code,
                legalEntityId: legalEntity.id,
                isActive: true,
                acceptsApplications: true,
              },
              [
                'name',
                'code',
                'legalEntityId',
                'isActive',
                'acceptsApplications',
              ],
            ),
            ipAddress,
          },
          transaction,
        );
        await this.audit.record(
          {
            action: 'USER_REGISTERED',
            entity: 'User',
            entityId: created.userId,
            actor,
            changes: buildAuditChanges(
              null,
              { selfRegistered: true, verificationPending: true },
              ['selfRegistered', 'verificationPending'],
            ),
            ipAddress,
          },
          transaction,
        );
        for (const assignment of created.assignments) {
          await this.audit.record(
            {
              action: 'ROLE_GRANTED',
              entity: 'UserRole',
              entityId: assignment.id,
              actor,
              changes: buildAuditChanges(
                null,
                {
                  role: assignment.roleCode,
                  scopeKey: `C:${created.congregationId}`,
                },
                ['role', 'scopeKey'],
              ),
              ipAddress,
            },
            transaction,
          );
        }
      });
    } catch (error) {
      if (error instanceof DuplicateRegistrationEmailError) {
        // Someone registered the same address a moment ago: it is the existing-account case.
        return this.answerForExistingAccount(email, fields.name);
      }
      throw error;
    }

    const link = emailVerificationLink(this.settings.appBaseUrl, opaque.token);
    // After the commit, not awaited: the mail server's time must not show in the response.
    void this.mailer.send(
      emailVerificationMessage(email, link, EMAIL_VERIFICATION_TOKEN_HOURS),
    );
    const devVerificationLink = devLinkFor(
      this.mailer,
      this.exposeDevLinks,
      link,
    );
    return {
      emailVerificationRequired: true,
      congregationName: fields.name,
      ...(devVerificationLink ? { devVerificationLink } : {}),
    };
  }

  /** Same shape as a real registration. The owner of the address gets a notice with no links. */
  private answerForExistingAccount(
    email: string,
    congregationName: string,
  ): RegistrationReceipt {
    void this.mailer.send(registrationNoticeMessage(email));
    return { emailVerificationRequired: true, congregationName };
  }

  private validate(input: RegisterCongregationInput, email: string) {
    const name = requiredText(
      input.congregation.name,
      'El nombre de la sede',
      FIELD_LIMITS.congregationName,
      'NAME_REQUIRED',
    );
    const displayName = requiredText(
      input.manager.displayName,
      'Tu nombre',
      DISPLAY_NAME_MAX_LENGTH,
      'INVALID_NAME',
    );
    if (displayName.length < DISPLAY_NAME_MIN_LENGTH) {
      throw new InvalidInputException(
        'Escribe tu nombre completo.',
        'INVALID_NAME',
      );
    }
    if (!EMAIL_PATTERN.test(email) || email.length > FIELD_LIMITS.email) {
      throw new InvalidInputException(
        'Escribe un correo electrónico válido.',
        'INVALID_EMAIL',
      );
    }
    assertStrongPassword(input.manager.password, [email, displayName]);

    return {
      name,
      displayName,
      municipalityCode: requiredText(
        input.congregation.municipalityCode,
        'El municipio de la sede',
        10,
        'MUNICIPALITY_REQUIRED',
      ),
      address: optionalText(
        input.congregation.address,
        'La dirección',
        FIELD_LIMITS.address,
      ),
      phone: optionalText(
        input.congregation.phone,
        'El teléfono',
        FIELD_LIMITS.phone,
      ),
      congregationEmail: optionalEmail(input.congregation.email),
    };
  }

  private async requireLegalEntity(
    id: number,
  ): Promise<RegistrationLegalEntity> {
    const legalEntity = await this.store.findActiveLegalEntity(id);
    if (!legalEntity) {
      throw new NotFoundDomainException(
        'La razón social elegida no existe o no está disponible. Elige otra de la lista.',
        'LEGAL_ENTITY_NOT_FOUND',
      );
    }
    return legalEntity;
  }

  /** Inside the country of the legal entity: the same code may exist in another country. */
  private async resolveMunicipality(
    countryId: number,
    code: string,
  ): Promise<number> {
    const id = await this.store.findMunicipalityId(countryId, code);
    if (id === null) {
      throw municipalityCountryMismatch();
    }
    return id;
  }
}
