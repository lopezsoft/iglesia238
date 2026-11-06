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
  'documentIssuePlaceCode',
  'birthDate',
  'birthPlaceCode',
  'sex',
  'maritalStatusCode',
  'educationLevelCode',
  'profession',
  'occupation',
  'workplace',
  'childrenCount',
  'phone',
  'landlinePhone',
  'workPhone',
  'email',
  'address',
  'municipalityCode',
  'neighborhood',
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
        data[field] !== undefined &&
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
  'convertedOn',
  'isBaptized',
  'waterBaptismOn',
  'baptismMunicipalityCode',
  'baptismPlace',
  'holySpiritBaptismOn',
  'reconciledOn',
  'previousCongregationId',
  'previousCongregationName',
  'isChristianEducationTeacher',
  'desiredAreas',
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
      convertedOn: source.convertedOn ?? null,
      isBaptized: source.isBaptized ?? null,
      waterBaptismOn: source.waterBaptismOn ?? null,
      baptismMunicipalityCode: source.baptismMunicipalityCode ?? null,
      baptismPlace: source.baptismPlace ?? null,
      baptizingPastorName: source.baptizingPastorName ?? null,
      holySpiritBaptismOn: source.holySpiritBaptismOn ?? null,
      reconciledOn: source.reconciledOn ?? null,
      previousCongregationId: source.previousCongregationId ?? null,
      previousCongregationName: source.previousCongregationName ?? null,
      isChristianEducationTeacher: source.isChristianEducationTeacher ?? false,
      desiredAreas: source.desiredAreas ?? null,
      pastorNotes: source.pastorNotes ?? null,
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
    const dateLabels = {
      joinedOn: 'La fecha de ingreso no es válida o es futura.',
      convertedOn: 'La fecha de conversión no es válida o es futura.',
      waterBaptismOn: 'La fecha del bautismo no es válida o es futura.',
      holySpiritBaptismOn:
        'La fecha de recepción del Espíritu Santo no es válida o es futura.',
      reconciledOn: 'La fecha de reconciliación no es válida o es futura.',
    } as const;

    for (const key of [
      'joinedOn',
      'convertedOn',
      'waterBaptismOn',
      'holySpiritBaptismOn',
      'reconciledOn',
    ] as const) {
      const value = patch[key];
      if (value !== undefined) {
        const date = emptyToNull(value);
        if (date !== null) {
          assertPastOrToday(date, today, dateLabels[key]);
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
    for (const key of [
      'baptismMunicipalityCode',
      'baptismPlace',
      'baptizingPastorName',
      'previousCongregationName',
      'desiredAreas',
      'pastorNotes',
    ] as const) {
      if (patch[key] !== undefined) {
        clean[key] = emptyToNull(patch[key]);
      }
    }
    if (patch.previousCongregationId !== undefined) {
      clean.previousCongregationId = patch.previousCongregationId;
    }
    if (patch.isChristianEducationTeacher !== undefined) {
      clean.isChristianEducationTeacher = patch.isChristianEducationTeacher;
    }
    return clean;
  }
}
