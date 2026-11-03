import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER } from '../../../../common/audit/audit-recorder.port.js';
import type { AuditRecorder } from '../../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import {
  InvalidInputException,
  NotFoundDomainException,
} from '../../../../common/errors/domain.exception.js';
import { TRANSACTION_RUNNER } from '../../../../common/persistence/transaction.js';
import type { TransactionRunner } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { MEMBER_NOT_FOUND_MESSAGE } from '../command-context.js';
import type { CommandContext } from '../command-context.js';
import { assertPastOrToday, emptyToNull } from '../member-rules.js';
import type {
  MemberDetail,
  MembershipDataPatch,
  PersonData,
} from '../member.models.js';
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
  assertDocumentAvailable,
  normalizePersonData,
  resolvePersonData,
  validatePersonData,
} from '../person-input.js';

async function loadDetail(
  members: MemberRepository,
  scope: TenantScope,
  memberId: number,
): Promise<MemberDetail> {
  const detail = await members.findDetail(scope, memberId);
  if (!detail) {
    throw new NotFoundDomainException(
      MEMBER_NOT_FOUND_MESSAGE,
      'MEMBER_NOT_FOUND',
    );
  }
  return detail;
}

@Injectable()
export class GetMemberUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
  ) {}

  execute(scope: TenantScope, memberId: number): Promise<MemberDetail> {
    return loadDetail(this.members, scope, memberId);
  }
}

const PERSON_FIELDS: readonly (keyof PersonData)[] = [
  'firstName',
  'lastName',
  'secondLastName',
  'documentTypeCode',
  'documentNumber',
  'birthDate',
  'sex',
  'maritalStatusCode',
  'educationLevelCode',
  'profession',
  'occupation',
  'phone',
  'email',
  'address',
  'municipalityCode',
];

@Injectable()
export class UpdateMemberPersonUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(PERSON_REPOSITORY) private readonly persons: PersonRepository,
    @Inject(CATALOG_RESOLVER) private readonly catalogs: CatalogResolver,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    input: PersonData,
  ): Promise<MemberDetail> {
    const { scope } = context;
    const current = await loadDetail(this.members, scope, memberId);
    const data = normalizePersonData(input);
    validatePersonData(data, this.clock.today());
    const resolved = await resolvePersonData(this.catalogs, data);

    const changed = PERSON_FIELDS.filter(
      (field) =>
        data[field] !== current.person[field as keyof typeof current.person],
    );

    await this.transactions.run(async (transaction) => {
      await assertDocumentAvailable(
        this.persons,
        scope,
        resolved,
        current.person.id,
        transaction,
      );
      await this.persons.update(
        scope,
        current.person.id,
        resolved,
        transaction,
      );
      await this.audit.record(
        {
          action: 'UPDATED',
          entity: 'Person',
          entityId: current.person.id,
          actor: context.actor,
          congregationId: current.congregationId,
          // Only the names of the fields: their values are personal data.
          changes: { fields: { from: null, to: changed.join(',') } },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
    return loadDetail(this.members, scope, memberId);
  }
}

const MEMBERSHIP_FIELDS = [
  'joinedOn',
  'isBaptized',
  'waterBaptismOn',
  'baptismPlace',
  'previousCongregationName',
] as const;

@Injectable()
export class UpdateMembershipDataUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    patch: MembershipDataPatch,
  ): Promise<MemberDetail> {
    const { scope } = context;
    const before = await loadDetail(this.members, scope, memberId);
    const clean = this.clean(patch);
    const snapshot = (source: MembershipDataPatch) => ({
      joinedOn: source.joinedOn ?? null,
      isBaptized: source.isBaptized ?? null,
      waterBaptismOn: source.waterBaptismOn ?? null,
      baptismPlace: source.baptismPlace ?? null,
      previousCongregationName: source.previousCongregationName ?? null,
    });

    await this.transactions.run(async (transaction) => {
      await this.members.updateMembershipData(
        scope,
        memberId,
        clean,
        transaction,
      );
      await this.audit.record(
        {
          action: 'UPDATED',
          entity: 'Member',
          entityId: memberId,
          actor: context.actor,
          congregationId: before.congregationId,
          changes: buildAuditChanges(
            snapshot(before),
            snapshot({ ...before, ...clean }),
            MEMBERSHIP_FIELDS,
          ),
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
    return loadDetail(this.members, scope, memberId);
  }

  private clean(patch: MembershipDataPatch): MembershipDataPatch {
    const today = this.clock.today();
    const clean: {
      -readonly [K in keyof MembershipDataPatch]: MembershipDataPatch[K];
    } = {};
    for (const key of ['joinedOn', 'waterBaptismOn'] as const) {
      const value = patch[key];
      if (value !== undefined) {
        const date = emptyToNull(value);
        if (date !== null) {
          assertPastOrToday(
            date,
            today,
            key === 'joinedOn'
              ? 'La fecha de ingreso no es válida o es futura.'
              : 'La fecha del bautismo no es válida o es futura.',
          );
        }
        clean[key] = date;
      }
    }
    if (patch.isBaptized !== undefined) {
      clean.isBaptized = patch.isBaptized;
    }
    if (clean.waterBaptismOn && patch.isBaptized === false) {
      throw new InvalidInputException(
        'No puedes indicar la fecha del bautismo si la persona no está bautizada.',
        'INVALID_BAPTISM',
      );
    }
    for (const key of ['baptismPlace', 'previousCongregationName'] as const) {
      if (patch[key] !== undefined) {
        clean[key] = emptyToNull(patch[key]);
      }
    }
    return clean;
  }
}
