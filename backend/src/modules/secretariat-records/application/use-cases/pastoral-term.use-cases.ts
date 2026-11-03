import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  NotFoundDomainException,
} from '../../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import {
  CONGREGATION_DIRECTORY,
  type CongregationDirectory,
  PASTORAL_TERM_REPOSITORY,
  PEOPLE_DIRECTORY,
  type PastoralTermRepository,
  type PeopleDirectory,
} from '../ports/records.ports.js';
import type {
  PastoralTermFilter,
  PastoralTermRecord,
} from '../records.models.js';
import {
  CONGREGATION_NOT_FOUND_MESSAGE,
  assertIsoDate,
  assertPastDate,
  openPeriod,
  periodsOverlap,
  previousDay,
  recordsAuditEntry,
  requirePeople,
} from '../records-rules.js';

export const PASTORAL_TERM_ENTITY = 'PastoralTerm';
export const TermAction = {
  recorded: 'PASTORAL_TERM_RECORDED',
  closed: 'PASTORAL_TERM_CLOSED',
} as const;

export const OVERLAPPING_TERM = 'OVERLAPPING_TERM';
export const TERM_NOT_FOUND = 'TERM_NOT_FOUND';

/** Terms of the scope, one timeline per sede. They are few, so the list is not paged. */
@Injectable()
export class ListPastoralTerms {
  constructor(
    @Inject(PASTORAL_TERM_REPOSITORY)
    private readonly terms: PastoralTermRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    filter: PastoralTermFilter,
  ): Promise<PastoralTermRecord[]> {
    const scope =
      filter.congregationId === undefined
        ? tenant.tenantScope()
        : tenant.congregationScope(filter.congregationId);
    return this.terms.list(scope, filter);
  }
}

export interface RecordPastoralTermCommand {
  readonly congregationId: number;
  readonly pastorId: number;
  readonly startedOn: string;
  readonly endedOn: string | null;
  /** Closes the open term of the sede the day before `startedOn`. */
  readonly closeCurrent: boolean;
}

/**
 * Registers the term of a pastor in a sede. The terms of a sede never overlap: the open one can be
 * closed the day before the new one starts, and the check runs under a lock of the sede so two
 * requests cannot both succeed.
 */
@Injectable()
export class RecordPastoralTerm {
  constructor(
    @Inject(PASTORAL_TERM_REPOSITORY)
    private readonly terms: PastoralTermRepository,
    @Inject(CONGREGATION_DIRECTORY)
    private readonly congregations: CongregationDirectory,
    @Inject(PEOPLE_DIRECTORY) private readonly people: PeopleDirectory,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    tenant: TenantContext,
    command: RecordPastoralTermCommand,
  ): Promise<PastoralTermRecord> {
    const scope = tenant.congregationScope(command.congregationId);
    const congregation = await this.congregations.findActive(
      scope,
      command.congregationId,
    );
    if (!congregation) {
      throw new NotFoundDomainException(CONGREGATION_NOT_FOUND_MESSAGE);
    }
    assertIsoDate(command.startedOn, 'Indica una fecha de inicio válida.');
    if (command.endedOn !== null) {
      assertIsoDate(command.endedOn, 'Indica una fecha de fin válida.');
      if (command.endedOn < command.startedOn) {
        throw new BusinessRuleException(
          'La fecha de fin no puede ser anterior a la de inicio.',
          'INVALID_DATE',
        );
      }
    }
    await requirePeople(this.people, scope, [command.pastorId]);

    return this.transactions.run(async (transaction) => {
      await this.terms.lockCongregation(scope, congregation.id, transaction);
      const periods = await this.terms.periodsOf(
        scope,
        congregation.id,
        transaction,
      );
      const open = openPeriod(periods);
      const closing =
        command.closeCurrent && open && open.startedOn < command.startedOn
          ? { ...open, endedOn: previousDay(command.startedOn) }
          : null;
      const others = periods.map((period) =>
        closing && period.id === closing.id ? closing : period,
      );
      if (others.some((period) => periodsOverlap(command, period))) {
        throw new ConflictDomainException(
          'Las fechas se solapan con otro periodo pastoral de la sede. Ajusta las fechas o cierra el periodo actual.',
          OVERLAPPING_TERM,
        );
      }

      if (closing?.endedOn) {
        await this.terms.setEndDate(
          scope,
          closing.id,
          closing.endedOn,
          transaction,
        );
        await this.audit.record(
          recordsAuditEntry(tenant, {
            entity: PASTORAL_TERM_ENTITY,
            entityId: closing.id,
            action: TermAction.closed,
            congregationId: congregation.id,
            changes: buildAuditChanges(
              { endedOn: null },
              { endedOn: closing.endedOn },
              ['endedOn'],
            ),
          }),
          transaction,
        );
      }

      const created = await this.terms.create(
        scope,
        {
          congregationId: congregation.id,
          pastorId: command.pastorId,
          startedOn: command.startedOn,
          endedOn: command.endedOn,
        },
        transaction,
      );
      await this.audit.record(
        recordsAuditEntry(tenant, {
          entity: PASTORAL_TERM_ENTITY,
          entityId: created.id,
          action: TermAction.recorded,
          congregationId: congregation.id,
          changes: buildAuditChanges(
            null,
            { startedOn: created.startedOn, endedOn: created.endedOn },
            ['startedOn', 'endedOn'],
          ),
        }),
        transaction,
      );
      return created;
    });
  }
}

/** Puts an end date on the open term of a sede (the pastor leaves without a successor yet). */
@Injectable()
export class ClosePastoralTerm {
  constructor(
    @Inject(PASTORAL_TERM_REPOSITORY)
    private readonly terms: PastoralTermRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    endedOn: string,
  ): Promise<PastoralTermRecord> {
    const scope = tenant.tenantScope();
    const current = await this.terms.find(scope, id);
    if (!current) {
      throw new NotFoundDomainException(
        'El periodo pastoral no existe o no pertenece a tu alcance.',
        TERM_NOT_FOUND,
      );
    }
    if (current.endedOn !== null) {
      throw new ConflictDomainException(
        'Este periodo pastoral ya tiene fecha de fin.',
        'TERM_ALREADY_CLOSED',
      );
    }
    assertPastDate(endedOn, 'de fin', this.clock.today());
    if (endedOn < current.startedOn) {
      throw new BusinessRuleException(
        'La fecha de fin no puede ser anterior a la de inicio.',
        'INVALID_DATE',
      );
    }

    return this.transactions.run(async (transaction) => {
      await this.terms.lockCongregation(
        scope,
        current.congregationId,
        transaction,
      );
      await this.terms.setEndDate(scope, id, endedOn, transaction);
      await this.audit.record(
        recordsAuditEntry(tenant, {
          entity: PASTORAL_TERM_ENTITY,
          entityId: id,
          action: TermAction.closed,
          congregationId: current.congregationId,
          changes: buildAuditChanges({ endedOn: null }, { endedOn }, [
            'endedOn',
          ]),
        }),
        transaction,
      );
      return { ...current, endedOn };
    });
  }
}
