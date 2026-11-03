import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../../common/mappers/value-mappers.js';
import type { Page } from '../../../../common/pagination/page.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import {
  CHILD_DEDICATION_REPOSITORY,
  CONGREGATION_DIRECTORY,
  type ChildDedicationRepository,
  type CongregationDirectory,
  PEOPLE_DIRECTORY,
  type PeopleDirectory,
} from '../ports/records.ports.js';
import {
  type ChildDedicationRecord,
  type DedicationFilter,
  MAX_PARENT_NAME_LENGTH,
  type ParentInput,
  type ParentRole,
} from '../records.models.js';
import {
  CONGREGATION_NOT_FOUND_MESSAGE,
  assertPastDate,
  recordsAuditEntry,
  requirePeople,
} from '../records-rules.js';

export const CHILD_DEDICATION_ENTITY = 'ChildDedication';
export const DedicationAction = {
  recorded: 'CHILD_DEDICATION_RECORDED',
  viewed: 'CHILD_DEDICATION_VIEWED',
} as const;
export const DEDICATION_NOT_FOUND = 'DEDICATION_NOT_FOUND';

export interface ListDedicationsQuery extends DedicationFilter {
  readonly page: number;
  readonly pageSize: number;
}

/** Presentations of children of the scope, most recent first. Documents of the children are masked. */
@Injectable()
export class ListChildDedications {
  constructor(
    @Inject(CHILD_DEDICATION_REPOSITORY)
    private readonly dedications: ChildDedicationRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    query: ListDedicationsQuery,
  ): Promise<Page<ChildDedicationRecord>> {
    const { page, pageSize, ...filter } = query;
    for (const date of [filter.from, filter.to]) {
      if (date !== undefined && !isIsoDate(date)) {
        throw new InvalidInputException('Indica fechas válidas (aaaa-mm-dd).');
      }
    }
    const scope =
      filter.congregationId === undefined
        ? tenant.tenantScope()
        : tenant.congregationScope(filter.congregationId);
    return this.dedications.list(scope, filter, { page, pageSize });
  }
}

/**
 * Opens one presentation. Records about minors are restricted, so every individual consultation
 * leaves an audit entry with who looked and which record.
 */
@Injectable()
export class GetChildDedication {
  constructor(
    @Inject(CHILD_DEDICATION_REPOSITORY)
    private readonly dedications: ChildDedicationRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    ipAddress: string | null = null,
  ): Promise<ChildDedicationRecord> {
    const dedication = await this.dedications.find(tenant.tenantScope(), id);
    if (!dedication) {
      throw new NotFoundDomainException(
        'La presentación no existe o no pertenece a tu alcance.',
        DEDICATION_NOT_FOUND,
      );
    }
    await this.audit.record({
      ...recordsAuditEntry(tenant, {
        entity: CHILD_DEDICATION_ENTITY,
        entityId: id,
        action: DedicationAction.viewed,
        congregationId: dedication.congregationId,
      }),
      ipAddress,
    });
    return dedication;
  }
}

export interface RecordDedicationCommand {
  readonly congregationId: number;
  readonly childId: number;
  readonly dedicatedOn: string;
  readonly pastorId?: number | null;
  readonly father?: ParentInput | null;
  readonly mother?: ParentInput | null;
  readonly guardian?: ParentInput | null;
}

interface ResolvedParent {
  readonly role: ParentRole;
  readonly personId: number | null;
  readonly name: string | null;
}

/**
 * Records the presentation of a child. A parent is a registered person or only a name; a parent
 * that is not registered becomes a person with just that name, created in the same transaction.
 */
@Injectable()
export class RecordChildDedication {
  constructor(
    @Inject(CHILD_DEDICATION_REPOSITORY)
    private readonly dedications: ChildDedicationRepository,
    @Inject(CONGREGATION_DIRECTORY)
    private readonly congregations: CongregationDirectory,
    @Inject(PEOPLE_DIRECTORY) private readonly people: PeopleDirectory,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    command: RecordDedicationCommand,
  ): Promise<ChildDedicationRecord> {
    const scope = tenant.congregationScope(command.congregationId);
    const congregation = await this.congregations.findActive(
      scope,
      command.congregationId,
    );
    if (!congregation) {
      throw new NotFoundDomainException(CONGREGATION_NOT_FOUND_MESSAGE);
    }

    const parents = this.resolveParents(command);
    const registeredIds = parents
      .map((parent) => parent.personId)
      .filter((id): id is number => id !== null);
    const pastorId = command.pastorId ?? null;
    const people = await requirePeople(this.people, scope, [
      command.childId,
      ...(pastorId === null ? [] : [pastorId]),
      ...registeredIds,
    ]);

    const child = people.get(command.childId)!;
    for (const person of [
      child,
      ...registeredIds.map((id) => people.get(id)!),
    ]) {
      if (
        person.congregationId !== null &&
        person.congregationId !== congregation.id
      ) {
        throw new BusinessRuleException(
          'La persona es miembro de otra sede: la presentación se registra en su sede.',
          'OUT_OF_SCOPE',
        );
      }
    }
    assertPastDate(
      command.dedicatedOn,
      'de la presentación',
      this.clock.today(),
    );
    if (child.birthDate && command.dedicatedOn < child.birthDate) {
      throw new BusinessRuleException(
        'La presentación no puede ser anterior al nacimiento.',
        'INVALID_DATE',
      );
    }

    return this.transactions.run(async (transaction) => {
      if (await this.dedications.existsForChild(scope, child.id, transaction)) {
        throw new ConflictDomainException(
          'Este niño o niña ya tiene una presentación registrada.',
          'DEDICATION_ALREADY_RECORDED',
        );
      }
      const linked: { role: ParentRole; personId: number }[] = [];
      for (const parent of parents) {
        const personId =
          parent.personId ??
          (await this.people.createNameOnly(
            scope,
            parent.name as string,
            transaction,
          ));
        linked.push({ role: parent.role, personId });
      }
      const created = await this.dedications.create(
        scope,
        {
          congregationId: congregation.id,
          childId: child.id,
          pastorId,
          dedicatedOn: command.dedicatedOn,
          parents: linked,
        },
        transaction,
      );
      await this.audit.record(
        recordsAuditEntry(tenant, {
          entity: CHILD_DEDICATION_ENTITY,
          entityId: created.id,
          action: DedicationAction.recorded,
          congregationId: congregation.id,
          changes: buildAuditChanges(
            null,
            {
              congregationId: congregation.id,
              dedicatedOn: created.dedicatedOn,
            },
            ['congregationId', 'dedicatedOn'],
          ),
        }),
        transaction,
      );
      return created;
    });
  }

  /** At least one of father, mother or guardian; nobody is their own parent; names are short. */
  private resolveParents(command: RecordDedicationCommand): ResolvedParent[] {
    const inputs: [ParentRole, ParentInput | null | undefined][] = [
      ['FATHER', command.father],
      ['MOTHER', command.mother],
      ['GUARDIAN', command.guardian],
    ];
    const parents: ResolvedParent[] = [];
    for (const [role, input] of inputs) {
      const personId = input?.personId ?? null;
      const name = input?.name?.trim() ?? '';
      if (personId === null && name === '') {
        continue;
      }
      if (personId === command.childId) {
        throw new BusinessRuleException(
          'El niño o la niña no puede figurar como su propio padre, madre o acudiente.',
          'INVALID_PARENT',
        );
      }
      if (personId === null && name.length > MAX_PARENT_NAME_LENGTH) {
        throw new BusinessRuleException(
          `El nombre admite máximo ${MAX_PARENT_NAME_LENGTH} caracteres.`,
          'INVALID_PARENT',
        );
      }
      parents.push({ role, personId, name: personId === null ? name : null });
    }
    if (parents.length === 0) {
      throw new BusinessRuleException(
        'Registra al menos al padre, la madre o un acudiente.',
        'PARENT_REQUIRED',
      );
    }
    const registered = parents
      .map((parent) => parent.personId)
      .filter((id): id is number => id !== null);
    if (new Set(registered).size !== registered.length) {
      throw new BusinessRuleException(
        'La misma persona no puede figurar con dos vínculos.',
        'INVALID_PARENT',
      );
    }
    return parents;
  }
}
