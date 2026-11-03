import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER } from '../../../../common/audit/audit-recorder.port.js';
import type { AuditRecorder } from '../../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  ErrorCode,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../../common/errors/domain.exception.js';
import { DocumentNumberingService } from '../../../../common/numbering/document-numbering.service.js';
import { TRANSACTION_RUNNER } from '../../../../common/persistence/transaction.js';
import type { TransactionRunner } from '../../../../common/persistence/transaction.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { MEMBER_NOT_FOUND_MESSAGE } from '../command-context.js';
import type { CommandContext } from '../command-context.js';
import { assertPastOrToday, emptyToNull, isMinorOn } from '../member-rules.js';
import type {
  MemberDetail,
  PersonData,
  ResolvedPersonData,
} from '../member.models.js';
import {
  CONSENT_REPOSITORY,
  FAMILY_REPOSITORY,
  REGISTRY_REPOSITORY,
} from '../ports/member-details.repositories.js';
import type {
  ConsentRepository,
  FamilyRepository,
  RegistryRepository,
} from '../ports/member-details.repositories.js';
import { MEMBER_REPOSITORY } from '../ports/member.repository.js';
import type { MemberRepository } from '../ports/member.repository.js';
import {
  CATALOG_RESOLVER,
  PERSON_REPOSITORY,
} from '../ports/person.repository.js';
import type {
  CatalogResolver,
  PersonRepository,
} from '../ports/person.repository.js';
import {
  normalizePersonData,
  resolvePersonData,
  validatePersonData,
} from '../person-input.js';
import { MEMBER_STATUS_LABELS } from '../members-csv.js';

export interface CreateMemberInput {
  /** Required in a denomination scope; fixed by a congregation scope. */
  readonly congregationId: number | null;
  /** Registers an existing person (a relative, a guardian) as a member instead of creating one. */
  readonly existingPersonId: number | null;
  /** Required when `existingPersonId` is null. */
  readonly person: PersonData | null;
  readonly joinedOn: string | null;
  readonly isBaptized: boolean | null;
  readonly waterBaptismOn: string | null;
  readonly baptismPlace: string | null;
  readonly previousCongregationName: string | null;
  readonly registryBook: string | null;
  readonly registryFolio: string | null;
  /** Adult who authorizes the data processing of a minor. */
  readonly guardianPersonId: number | null;
  /** The signed paper form of data processing (Ley 1581 de 2012) was received. */
  readonly consentAccepted: boolean;
}

type Subject =
  | { kind: 'existing'; personId: number; birthDate: string | null }
  | { kind: 'new'; resolved: ResolvedPersonData; birthDate: string | null };

/**
 * Manual registration of a member (a person present at the secretariat, a legacy record). It does
 * what the approval of an application does: person, member, registry entry with the next number of
 * the congregation, status history and the data processing consent, in one transaction.
 */
@Injectable()
export class CreateMemberUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(PERSON_REPOSITORY) private readonly persons: PersonRepository,
    @Inject(CATALOG_RESOLVER) private readonly catalogs: CatalogResolver,
    @Inject(REGISTRY_REPOSITORY) private readonly registry: RegistryRepository,
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
    @Inject(FAMILY_REPOSITORY) private readonly family: FamilyRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly numbering: DocumentNumberingService,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    input: CreateMemberInput,
  ): Promise<MemberDetail> {
    const today = this.clock.today();
    const congregationId = this.congregationOf(context, input);
    const scope = context.scope.forCongregation(congregationId);

    const congregation = await this.registry.findCongregation(
      scope,
      congregationId,
    );
    if (!congregation) {
      throw new NotFoundDomainException('La sede no existe.');
    }
    if (!congregation.isActive) {
      throw new BusinessRuleException(
        'La sede está inactiva: no se pueden registrar miembros en ella.',
        'CONGREGATION_INACTIVE',
      );
    }
    if (!input.consentAccepted) {
      throw new BusinessRuleException(
        'Confirma que recibiste la autorización firmada de tratamiento de datos.',
        'CONSENT_REQUIRED',
      );
    }
    const policy = await this.consents.currentPolicy(scope, today);
    if (!policy) {
      throw new BusinessRuleException(
        'La denominación no tiene una política de tratamiento de datos publicada. Publícala antes de registrar miembros.',
        'POLICY_NOT_PUBLISHED',
      );
    }

    const joinedOn = emptyToNull(input.joinedOn) ?? today;
    assertPastOrToday(
      joinedOn,
      today,
      'La fecha de ingreso no es válida o es futura.',
    );
    const waterBaptismOn = emptyToNull(input.waterBaptismOn);
    if (waterBaptismOn !== null) {
      assertPastOrToday(
        waterBaptismOn,
        today,
        'La fecha del bautismo no es válida o es futura.',
      );
      if (input.isBaptized === false) {
        throw new InvalidInputException(
          'No puedes indicar la fecha del bautismo si la persona no está bautizada.',
          'INVALID_BAPTISM',
        );
      }
    }

    const subject = await this.subject(scope, input, today);
    const guardianId = await this.guardianFor(
      scope,
      subject.birthDate,
      input,
      today,
    );

    const memberId = await this.transactions.run(async (transaction) => {
      const personId =
        subject.kind === 'existing'
          ? subject.personId
          : await this.persons.insert(scope, subject.resolved, transaction);

      const newMemberId = await this.members.insert(
        scope,
        {
          personId,
          congregationId,
          joinedOn,
          isBaptized: input.isBaptized,
          waterBaptismOn,
          baptismPlace: emptyToNull(input.baptismPlace),
          previousCongregationName: emptyToNull(input.previousCongregationName),
        },
        transaction,
      );
      const memberNumber = await this.numbering.nextMemberNumber(
        scope,
        transaction,
      );
      await this.registry.openEntry(
        scope,
        {
          memberId: newMemberId,
          congregationId,
          memberNumber,
          startedOn: joinedOn,
          registryBook: emptyToNull(input.registryBook),
          registryFolio: emptyToNull(input.registryFolio),
        },
        transaction,
      );
      await this.registry.addStatusHistory(
        scope,
        {
          memberId: newMemberId,
          status: 'ACTIVE',
          startedOn: joinedOn,
          reason: 'Registro manual',
          userId: context.actor.userId,
        },
        transaction,
      );
      await this.consents.grant(
        scope,
        {
          personId,
          guardianId,
          policyId: policy.id,
          channel: 'PAPER',
          grantedAt: this.clock.now(),
        },
        transaction,
      );
      if (guardianId !== null) {
        await this.linkGuardian(scope, personId, guardianId, transaction);
      }
      await this.audit.record(
        {
          action: 'MEMBER_CREATED',
          entity: 'Member',
          entityId: newMemberId,
          actor: context.actor,
          congregationId,
          changes: buildAuditChanges(null, { status: 'ACTIVE', memberNumber }, [
            'status',
            'memberNumber',
          ]),
          ipAddress: context.ipAddress,
        },
        transaction,
      );
      return newMemberId;
    });

    const detail = await this.members.findDetail(scope, memberId);
    if (!detail) {
      throw new NotFoundDomainException(
        MEMBER_NOT_FOUND_MESSAGE,
        'MEMBER_NOT_FOUND',
      );
    }
    return detail;
  }

  private congregationOf(
    context: CommandContext,
    input: CreateMemberInput,
  ): number {
    const fixed = context.scope.congregationId;
    if (fixed !== null) {
      if (input.congregationId !== null && input.congregationId !== fixed) {
        throw new NotFoundDomainException('La sede no existe.');
      }
      return fixed;
    }
    if (input.congregationId === null) {
      throw new InvalidInputException(
        'Indica la sede en la que se registra el miembro.',
        ErrorCode.CONGREGATION_SCOPE_REQUIRED,
      );
    }
    return input.congregationId;
  }

  /** The existing person to promote, or the validated data of a new one. */
  private async subject(
    scope: CommandContext['scope'],
    input: CreateMemberInput,
    today: string,
  ): Promise<Subject> {
    if (input.existingPersonId !== null) {
      const existing = await this.persons.findExisting(
        scope,
        input.existingPersonId,
      );
      if (!existing) {
        throw new NotFoundDomainException('La persona seleccionada no existe.');
      }
      if (existing.hasMember) {
        throw new ConflictDomainException(
          `Esa persona ya es miembro (estado ${MEMBER_STATUS_LABELS[existing.memberStatus ?? 'ACTIVE'].toLowerCase()}). Si volvió a la iglesia, cambia su estado a Activo desde su ficha.`,
          'ALREADY_MEMBER',
        );
      }
      return {
        kind: 'existing',
        personId: existing.id,
        birthDate: existing.birthDate,
      };
    }
    if (input.person === null) {
      throw new InvalidInputException('Completa los datos de la persona.');
    }
    const data = normalizePersonData(input.person);
    validatePersonData(data, today);
    const resolved = await resolvePersonData(this.catalogs, data);
    if (resolved.documentTypeId !== null && resolved.documentNumber !== null) {
      const duplicate = await this.persons.findByDocument(
        scope,
        resolved.documentTypeId,
        resolved.documentNumber,
        null,
      );
      if (duplicate?.hasMember) {
        throw new ConflictDomainException(
          'Ya existe un miembro con ese documento en la denominación.',
          'DUPLICATE_DOCUMENT',
        );
      }
      if (duplicate) {
        throw new ConflictDomainException(
          'Ya existe una persona con ese documento que aún no es miembro. Selecciónala en “Persona ya registrada” para registrarla como miembro.',
          'PERSON_EXISTS',
        );
      }
    }
    return { kind: 'new', resolved, birthDate: data.birthDate };
  }

  private async guardianFor(
    scope: CommandContext['scope'],
    birthDate: string | null,
    input: CreateMemberInput,
    today: string,
  ): Promise<number | null> {
    if (!isMinorOn(birthDate, today)) {
      return null;
    }
    if (input.guardianPersonId === null) {
      throw new BusinessRuleException(
        'Un menor de edad necesita un acudiente que autorice el tratamiento de sus datos.',
        'GUARDIAN_REQUIRED',
      );
    }
    if (input.guardianPersonId === input.existingPersonId) {
      throw new BusinessRuleException(
        'El acudiente no puede ser el mismo menor.',
        'GUARDIAN_INVALID',
      );
    }
    const guardian = await this.persons.findExisting(
      scope,
      input.guardianPersonId,
    );
    if (!guardian) {
      throw new NotFoundDomainException('El acudiente seleccionado no existe.');
    }
    return guardian.id;
  }

  private async linkGuardian(
    scope: CommandContext['scope'],
    personId: number,
    guardianId: number,
    transaction: Parameters<FamilyRepository['add']>[4],
  ): Promise<void> {
    const rows = await this.family.rowsOf(scope, personId, transaction);
    if (!rows.some((row) => row.relativeId === guardianId)) {
      await this.family.add(
        scope,
        personId,
        guardianId,
        'GUARDIAN',
        transaction,
      );
    }
  }
}
