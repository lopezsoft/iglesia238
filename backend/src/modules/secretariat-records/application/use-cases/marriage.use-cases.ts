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
import { ADULT_AGE, ageOn } from '../../../../common/people/age.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import {
  MARRIAGE_REPOSITORY,
  type MarriageRepository,
  PEOPLE_DIRECTORY,
  type PeopleDirectory,
} from '../ports/records.ports.js';
import {
  MAX_PLACE_LENGTH,
  type MarriageEndReason,
  type MarriageFilter,
  type MarriageRecord,
  type MarriageRegistry,
} from '../records.models.js';
import {
  assertPastDate,
  personNotFound,
  recordsAuditEntry,
  requirePeople,
} from '../records-rules.js';

export const MARRIAGE_ENTITY = 'Marriage';
export const MarriageAction = {
  recorded: 'MARRIAGE_RECORDED',
  dissolved: 'MARRIAGE_DISSOLVED',
} as const;
export const MARRIAGE_NOT_FOUND = 'MARRIAGE_NOT_FOUND';

const REGISTRIES: readonly MarriageRegistry[] = ['NOTARY', 'CHURCH'];
const END_REASONS: readonly MarriageEndReason[] = [
  'DIVORCE',
  'DEATH',
  'ANNULMENT',
];

function marriageNotFound(): NotFoundDomainException {
  return new NotFoundDomainException(
    'El matrimonio no existe o no pertenece a tu alcance.',
    MARRIAGE_NOT_FOUND,
  );
}

export interface ListMarriagesQuery extends MarriageFilter {
  readonly page: number;
  readonly pageSize: number;
}

/** Marriages of the scope. A sede sees those where one of the spouses is a member of the sede. */
@Injectable()
export class ListMarriages {
  constructor(
    @Inject(MARRIAGE_REPOSITORY) private readonly marriages: MarriageRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    query: ListMarriagesQuery,
  ): Promise<Page<MarriageRecord>> {
    const { page, pageSize, ...filter } = query;
    for (const date of [filter.from, filter.to]) {
      if (date !== undefined && !isIsoDate(date)) {
        throw new InvalidInputException('Indica fechas válidas (aaaa-mm-dd).');
      }
    }
    return this.marriages.list(tenant.tenantScope(), filter, {
      page,
      pageSize,
    });
  }
}

@Injectable()
export class GetMarriage {
  constructor(
    @Inject(MARRIAGE_REPOSITORY) private readonly marriages: MarriageRepository,
  ) {}

  async execute(tenant: TenantContext, id: number): Promise<MarriageRecord> {
    const marriage = await this.marriages.find(tenant.tenantScope(), id);
    if (!marriage) {
      throw marriageNotFound();
    }
    return marriage;
  }
}

export interface RecordMarriageCommand {
  readonly spouse1Id: number;
  readonly spouse2Id: number;
  readonly marriedOn: string;
  readonly place: string;
  readonly registeredWith: MarriageRegistry;
  readonly officiantId?: number | null;
}

/**
 * Registers a marriage. Both spouses belong to the denomination and are adults on the wedding day;
 * in a sede scope at least one is a member of the sede. Nobody can have two marriages in force: the
 * check runs under a lock on both people, so two requests cannot both succeed.
 */
@Injectable()
export class RecordMarriage {
  constructor(
    @Inject(MARRIAGE_REPOSITORY) private readonly marriages: MarriageRepository,
    @Inject(PEOPLE_DIRECTORY) private readonly people: PeopleDirectory,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    command: RecordMarriageCommand,
  ): Promise<MarriageRecord> {
    if (command.spouse1Id === command.spouse2Id) {
      throw new BusinessRuleException(
        'Los cónyuges deben ser personas distintas.',
        'SAME_PERSON',
      );
    }
    const scope = tenant.tenantScope();
    const officiantId = command.officiantId ?? null;
    const people = await requirePeople(this.people, scope, [
      command.spouse1Id,
      command.spouse2Id,
      ...(officiantId === null ? [] : [officiantId]),
    ]);
    const spouses = [
      people.get(command.spouse1Id)!,
      people.get(command.spouse2Id)!,
    ];

    if (
      scope.congregationId !== null &&
      !spouses.some((spouse) => spouse.congregationId === scope.congregationId)
    ) {
      // Members of another sede are not visible from this one; two people without sede are just not enough.
      if (spouses.some((spouse) => spouse.congregationId !== null)) {
        throw personNotFound();
      }
      throw new BusinessRuleException(
        'Al menos uno de los cónyuges debe ser miembro de la sede activa.',
        'OUT_OF_SCOPE',
      );
    }
    assertPastDate(command.marriedOn, 'del matrimonio', this.clock.today());
    if (
      spouses.some(
        (spouse) =>
          (spouse.birthDate
            ? ageOn(spouse.birthDate, command.marriedOn)
            : ADULT_AGE) < ADULT_AGE,
      )
    ) {
      throw new BusinessRuleException(
        `Los cónyuges deben tener al menos ${ADULT_AGE} años en la fecha del matrimonio.`,
        'INVALID_SPOUSE',
      );
    }
    const place = command.place.trim();
    if (place === '' || place.length > MAX_PLACE_LENGTH) {
      throw new BusinessRuleException(
        `Indica el lugar de la ceremonia (máximo ${MAX_PLACE_LENGTH} caracteres).`,
        'INVALID_PLACE',
      );
    }
    if (!REGISTRIES.includes(command.registeredWith)) {
      throw new BusinessRuleException(
        'Selecciona dónde quedó registrado el matrimonio.',
        'INVALID_REGISTRY',
      );
    }
    if (
      officiantId !== null &&
      (officiantId === command.spouse1Id || officiantId === command.spouse2Id)
    ) {
      throw new BusinessRuleException(
        'El oficiante no puede ser uno de los cónyuges.',
        'INVALID_OFFICIANT',
      );
    }

    const [spouse1Id, spouse2Id] = [command.spouse1Id, command.spouse2Id].sort(
      (a, b) => a - b,
    );
    return this.transactions.run(async (transaction) => {
      await this.people.lock(scope, [spouse1Id, spouse2Id], transaction);
      if (
        await this.marriages.hasActiveMarriage(
          scope,
          [spouse1Id, spouse2Id],
          transaction,
        )
      ) {
        throw new ConflictDomainException(
          'Uno de los cónyuges ya tiene un matrimonio vigente. Registra primero su disolución.',
          'ACTIVE_MARRIAGE_EXISTS',
        );
      }
      const created = await this.marriages.create(
        scope,
        {
          spouse1Id,
          spouse2Id,
          marriedOn: command.marriedOn,
          place,
          registeredWith: command.registeredWith,
          officiantId,
        },
        transaction,
      );
      await this.audit.record(
        recordsAuditEntry(tenant, {
          entity: MARRIAGE_ENTITY,
          entityId: created.id,
          action: MarriageAction.recorded,
          congregationId: scope.congregationId,
          changes: buildAuditChanges(
            null,
            {
              registeredWith: command.registeredWith,
              marriedOn: command.marriedOn,
            },
            ['registeredWith', 'marriedOn'],
          ),
        }),
        transaction,
      );
      return created;
    });
  }
}

export interface DissolveMarriageCommand {
  readonly endedOn: string;
  readonly endReason: MarriageEndReason;
}

/** Ends a marriage. The record is kept (status DISSOLVED) and the change is audited without details. */
@Injectable()
export class DissolveMarriage {
  constructor(
    @Inject(MARRIAGE_REPOSITORY) private readonly marriages: MarriageRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    command: DissolveMarriageCommand,
  ): Promise<MarriageRecord> {
    const scope = tenant.tenantScope();
    const current = await this.marriages.find(scope, id);
    if (!current) {
      throw marriageNotFound();
    }
    if (current.status === 'DISSOLVED') {
      throw new ConflictDomainException(
        'Este matrimonio ya tiene registrada su disolución.',
        'ALREADY_DISSOLVED',
      );
    }
    if (!END_REASONS.includes(command.endReason)) {
      throw new BusinessRuleException(
        'Selecciona el motivo de la disolución.',
        'INVALID_END_REASON',
      );
    }
    assertPastDate(command.endedOn, 'de la disolución', this.clock.today());
    if (current.marriedOn && command.endedOn < current.marriedOn) {
      throw new BusinessRuleException(
        'La disolución no puede ser anterior a la fecha del matrimonio.',
        'INVALID_DATE',
      );
    }

    return this.transactions.run(async (transaction) => {
      const updated = await this.marriages.dissolve(
        scope,
        id,
        command,
        transaction,
      );
      await this.audit.record(
        recordsAuditEntry(tenant, {
          entity: MARRIAGE_ENTITY,
          entityId: id,
          action: MarriageAction.dissolved,
          congregationId: scope.congregationId,
          changes: buildAuditChanges(
            { status: 'ACTIVE', endReason: null },
            { status: 'DISSOLVED', endReason: command.endReason },
            ['status', 'endReason'],
          ),
        }),
        transaction,
      );
      return updated;
    });
  }
}
