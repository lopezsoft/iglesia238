import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER } from '../../../../common/audit/audit-recorder.port.js';
import type { AuditRecorder } from '../../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../../common/errors/domain.exception.js';
import { TRANSACTION_RUNNER } from '../../../../common/persistence/transaction.js';
import type { TransactionRunner } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { Clock, bogotaDateOf } from '../../../../common/time/bogota-time.js';
import { requireMember } from '../command-context.js';
import type { CommandContext } from '../command-context.js';
import type {
  ConsentView,
  SocioeconomicProfileData,
  SocioeconomicProfileView,
} from '../member.models.js';
import {
  CONSENT_REPOSITORY,
  SOCIOECONOMIC_REPOSITORY,
} from '../ports/member-details.repositories.js';
import type {
  ConsentRepository,
  SocioeconomicRepository,
} from '../ports/member-details.repositories.js';
import { MEMBER_REPOSITORY } from '../ports/member.repository.js';
import type { MemberRepository } from '../ports/member.repository.js';
import { PERSON_REPOSITORY } from '../ports/person.repository.js';
import type { PersonRepository } from '../ports/person.repository.js';

const SISBEN_LEVELS: readonly number[] = [1, 2, 3, 4, 5, 6];

/** Reading the profile is audited: it is the most sensitive data of the file. */
@Injectable()
export class GetSocioeconomicProfileUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(SOCIOECONOMIC_REPOSITORY)
    private readonly profiles: SocioeconomicRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
  ): Promise<SocioeconomicProfileView | null> {
    const member = await requireMember(this.members, context.scope, memberId);
    await this.audit.record({
      action: 'SOCIOECONOMIC_PROFILE_VIEWED',
      entity: 'SocioeconomicProfile',
      entityId: member.personId,
      actor: context.actor,
      congregationId: member.congregationId,
      ipAddress: context.ipAddress,
    });
    return this.profiles.find(context.scope, member.personId);
  }
}

@Injectable()
export class SaveSocioeconomicProfileUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(SOCIOECONOMIC_REPOSITORY)
    private readonly profiles: SocioeconomicRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    data: SocioeconomicProfileData,
  ): Promise<SocioeconomicProfileView> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    if (
      data.sisbenLevel !== null &&
      !SISBEN_LEVELS.includes(data.sisbenLevel)
    ) {
      throw new InvalidInputException(
        'El nivel del SISBÉN debe estar entre 1 y 6.',
      );
    }
    return this.transactions.run(async (transaction) => {
      const saved = await this.profiles.save(
        scope,
        member.personId,
        data,
        transaction,
      );
      // The answers are sensitive: the audit records that they changed, never their values.
      await this.audit.record(
        {
          action: 'UPDATED',
          entity: 'SocioeconomicProfile',
          entityId: member.personId,
          actor: context.actor,
          congregationId: member.congregationId,
          ipAddress: context.ipAddress,
        },
        transaction,
      );
      return saved;
    });
  }
}

@Injectable()
export class ListConsentsUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
  ) {}

  async execute(scope: TenantScope, memberId: number): Promise<ConsentView[]> {
    const member = await requireMember(this.members, scope, memberId);
    const rows = await this.consents.list(scope, member.personId);
    return [...rows].sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
  }
}

/** Revoking never deletes the consent: it stays as evidence, marked as revoked. */
@Injectable()
export class RevokeConsentUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    consentId: number,
  ): Promise<void> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    const consent = await this.consents.find(scope, member.personId, consentId);
    if (!consent) {
      throw new NotFoundDomainException('La autorización no existe.');
    }
    if (consent.revokedAt !== null) {
      throw new ConflictDomainException(
        'La autorización ya estaba revocada.',
        'ALREADY_REVOKED',
      );
    }
    const revokedAt = this.clock.now();
    await this.transactions.run(async (transaction) => {
      await this.consents.revoke(scope, consent.id, revokedAt, transaction);
      await this.audit.record(
        {
          action: 'CONSENT_REVOKED',
          entity: 'DataConsent',
          entityId: consent.id,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: {
            revokedAt: { from: null, to: bogotaDateOf(revokedAt) },
            anonymizationPending: { from: false, to: true },
          },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
  }
}

/**
 * Right to erasure (Ley 1581 de 2012): once every consent was revoked and the member is no longer
 * active, the personal data are removed irreversibly. The member record, its registry and the
 * accounting records stay, now pointing to an anonymous person.
 */
@Injectable()
export class AnonymizeMemberUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(PERSON_REPOSITORY) private readonly persons: PersonRepository,
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(context: CommandContext, memberId: number): Promise<void> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    const person = await this.persons.findExisting(scope, member.personId);
    if (!person) {
      throw new NotFoundDomainException('La persona no existe.');
    }
    if (person.userId !== null) {
      throw new BusinessRuleException(
        'La persona tiene un usuario del sistema: desactiva primero su cuenta antes de anonimizar sus datos.',
        'PERSON_HAS_USER',
      );
    }
    if (member.status === 'ACTIVE') {
      throw new BusinessRuleException(
        'Cambia el estado del miembro a Inactivo antes de anonimizar sus datos.',
        'MEMBER_STILL_ACTIVE',
      );
    }
    const inForce = await this.consents.countInForce(scope, member.personId);
    const total = await this.consents.countAll(scope, member.personId);
    if (total === 0 || inForce > 0) {
      throw new BusinessRuleException(
        'Para anonimizar, primero revoca todas las autorizaciones de tratamiento de datos vigentes.',
        'CONSENT_IN_FORCE',
      );
    }

    await this.transactions.run(async (transaction) => {
      await this.persons.anonymize(scope, member.personId, transaction);
      await this.members.clearNotes(scope, member.id, transaction);
      await this.audit.record(
        {
          action: 'PERSON_ANONYMIZED',
          entity: 'Person',
          entityId: member.personId,
          actor: context.actor,
          congregationId: member.congregationId,
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
  }
}
