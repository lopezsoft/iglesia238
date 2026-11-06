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
import { requireMember } from '../command-context.js';
import type { CommandContext } from '../command-context.js';
import type {
  FamilyRelationType,
  FamilyRelationView,
  Sex,
} from '../member.models.js';
import { FAMILY_REPOSITORY } from '../ports/member-details.repositories.js';
import type { FamilyRepository } from '../ports/member-details.repositories.js';
import { MEMBER_REPOSITORY } from '../ports/member.repository.js';
import type { MemberRepository } from '../ports/member.repository.js';
import { PERSON_REPOSITORY } from '../ports/person.repository.js';
import type { PersonRepository } from '../ports/person.repository.js';

const PARENT_TYPES: readonly FamilyRelationType[] = ['FATHER', 'MOTHER'];

/**
 * What the person is to the relative. The relation is stored in both directions when it is
 * unambiguous: if Ana has Luis as FATHER, Luis has Ana as CHILD. A guardian has no inverse.
 */
export function inverseTypeOf(
  type: FamilyRelationType,
  personSex: Sex | null,
): FamilyRelationType | null {
  if (PARENT_TYPES.includes(type)) {
    return 'CHILD';
  }
  if (type === 'CHILD') {
    if (personSex === 'MALE') {
      return 'FATHER';
    }
    return personSex === 'FEMALE' ? 'MOTHER' : null;
  }
  return null;
}

const INVERSES_TO_REMOVE: Readonly<
  Record<FamilyRelationType, readonly FamilyRelationType[]>
> = {
  FATHER: ['CHILD'],
  MOTHER: ['CHILD'],
  CHILD: ['FATHER', 'MOTHER'],
  GUARDIAN: [],
};

function parentMessage(type: FamilyRelationType, ofRelative: boolean): string {
  const noun = type === 'FATHER' ? 'un padre' : 'una madre';
  return ofRelative
    ? `Esa persona ya tiene ${noun} registrado(a), no se puede registrar otro vínculo de ese tipo.`
    : `Ya hay ${noun} registrado(a).`;
}

@Injectable()
export class ListFamilyUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(FAMILY_REPOSITORY) private readonly family: FamilyRepository,
  ) {}

  async execute(
    scope: TenantScope,
    memberId: number,
  ): Promise<FamilyRelationView[]> {
    const member = await requireMember(this.members, scope, memberId);
    return this.family.list(scope, member.personId);
  }
}

export interface AddRelationCommand {
  readonly relativeId?: number | null;
  readonly type: FamilyRelationType;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly secondLastName?: string | null;
  readonly sex?: Sex | null;
  readonly birthDate?: string | null;
}

export interface UpdateRelationCommand {
  readonly type: FamilyRelationType;
  readonly firstName: string;
  readonly lastName?: string | null;
  readonly secondLastName?: string | null;
  readonly sex?: Sex | null;
  readonly birthDate?: string | null;
}

@Injectable()
export class AddFamilyRelationUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(PERSON_REPOSITORY) private readonly persons: PersonRepository,
    @Inject(FAMILY_REPOSITORY) private readonly family: FamilyRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    command: AddRelationCommand,
  ): Promise<void> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    const hasExistingId =
      typeof command.relativeId === 'number' && command.relativeId > 0;

    if (hasExistingId && command.relativeId === member.personId) {
      throw new BusinessRuleException(
        'Una persona no puede ser su propio familiar.',
        'INVALID_RELATION',
      );
    }

    if (!hasExistingId) {
      const firstName = command.firstName?.trim() ?? '';
      if (firstName.length < 2 || firstName.length > 100) {
        throw new InvalidInputException(
          'Escribe el nombre del familiar (entre 2 y 100 caracteres).',
        );
      }
    }

    const relative = hasExistingId
      ? await this.persons.findExisting(scope, command.relativeId as number)
      : null;
    if (hasExistingId && !relative) {
      throw new NotFoundDomainException(
        'La persona seleccionada no existe en la denominación.',
      );
    }

    const person = await this.persons.findExisting(scope, member.personId);
    const rows = await this.family.rowsOf(scope, member.personId);
    if (relative && rows.some((row) => row.relativeId === relative.id)) {
      throw new ConflictDomainException(
        'Esta persona ya está registrada como familiar.',
        'DUPLICATE_RELATION',
      );
    }
    if (
      PARENT_TYPES.includes(command.type) &&
      rows.some((row) => row.type === command.type)
    ) {
      throw new ConflictDomainException(
        parentMessage(command.type, false),
        'PARENT_ALREADY_SET',
      );
    }

    const inverse = inverseTypeOf(command.type, person?.sex ?? null);
    const relativeRows =
      inverse && relative ? await this.family.rowsOf(scope, relative.id) : [];
    const inverseExists = relativeRows.some(
      (row) => row.relativeId === member.personId,
    );
    if (
      inverse &&
      !inverseExists &&
      PARENT_TYPES.includes(inverse) &&
      relativeRows.some((row) => row.type === inverse)
    ) {
      throw new ConflictDomainException(
        parentMessage(inverse, true),
        'PARENT_ALREADY_SET',
      );
    }

    await this.transactions.run(async (transaction) => {
      const targetRelativeId = relative
        ? relative.id
        : await this.family.createRelativePerson!(
            scope,
            {
              firstName: command.firstName!.trim(),
              lastName: command.lastName ?? null,
              secondLastName: command.secondLastName ?? null,
              sex: command.sex ?? null,
              birthDate: command.birthDate ?? null,
            },
            transaction,
          );

      const id = await this.family.add(
        scope,
        member.personId,
        targetRelativeId,
        command.type,
        transaction,
      );
      if (inverse && !inverseExists) {
        await this.family.add(
          scope,
          targetRelativeId,
          member.personId,
          inverse,
          transaction,
        );
      }
      await this.audit.record(
        {
          action: 'CREATED',
          entity: 'FamilyRelation',
          entityId: id,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: { type: { from: null, to: command.type } },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
  }
}

@Injectable()
export class UpdateFamilyRelationUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(PERSON_REPOSITORY) private readonly persons: PersonRepository,
    @Inject(FAMILY_REPOSITORY) private readonly family: FamilyRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    relationId: number,
    command: UpdateRelationCommand,
  ): Promise<void> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    const firstName = command.firstName.trim();
    if (firstName.length < 2 || firstName.length > 100) {
      throw new InvalidInputException(
        'Escribe el nombre del familiar (entre 2 y 100 caracteres).',
      );
    }

    const rows = await this.family.rowsOf(scope, member.personId);
    const row = rows.find((candidate) => candidate.id === relationId);
    if (!row) {
      throw new NotFoundDomainException('El parentesco ya no existe.');
    }

    if (
      command.type !== row.type &&
      PARENT_TYPES.includes(command.type) &&
      rows.some(
        (candidate) =>
          candidate.id !== relationId && candidate.type === command.type,
      )
    ) {
      throw new ConflictDomainException(
        parentMessage(command.type, false),
        'PARENT_ALREADY_SET',
      );
    }

    const person = await this.persons.findExisting(scope, member.personId);
    const newInverse = inverseTypeOf(command.type, person?.sex ?? null);
    const relativeRows = await this.family.rowsOf(scope, row.relativeId);
    const oldInverses = relativeRows.filter(
      (candidate) =>
        candidate.relativeId === member.personId &&
        INVERSES_TO_REMOVE[row.type].includes(candidate.type),
    );

    await this.transactions.run(async (transaction) => {
      if (command.type !== row.type) {
        await this.family.updateType!(
          scope,
          row.id,
          command.type,
          transaction,
        );
        for (const inverse of oldInverses) {
          await this.family.remove(scope, inverse.id, transaction);
        }
        if (newInverse) {
          await this.family.add(
            scope,
            row.relativeId,
            member.personId,
            newInverse,
            transaction,
          );
        }
      }
      await this.family.updateRelativePerson!(
        scope,
        row.relativeId,
        {
          firstName,
          lastName: command.lastName ?? null,
          secondLastName: command.secondLastName ?? null,
          sex: command.sex ?? null,
          birthDate: command.birthDate ?? null,
        },
        transaction,
      );
      await this.audit.record(
        {
          action: 'UPDATED',
          entity: 'FamilyRelation',
          entityId: row.id,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: { type: { from: row.type, to: command.type } },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
  }
}

@Injectable()
export class RemoveFamilyRelationUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(FAMILY_REPOSITORY) private readonly family: FamilyRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    relationId: number,
  ): Promise<void> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    const rows = await this.family.rowsOf(scope, member.personId);
    const row = rows.find((candidate) => candidate.id === relationId);
    if (!row) {
      throw new NotFoundDomainException('El parentesco ya no existe.');
    }
    const inverseRows = (
      await this.family.rowsOf(scope, row.relativeId)
    ).filter(
      (candidate) =>
        candidate.relativeId === member.personId &&
        INVERSES_TO_REMOVE[row.type].includes(candidate.type),
    );

    await this.transactions.run(async (transaction) => {
      await this.family.remove(scope, row.id, transaction);
      for (const inverse of inverseRows) {
        await this.family.remove(scope, inverse.id, transaction);
      }
      await this.audit.record(
        {
          action: 'DELETED',
          entity: 'FamilyRelation',
          entityId: row.id,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: { type: { from: row.type, to: null } },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
  }
}
