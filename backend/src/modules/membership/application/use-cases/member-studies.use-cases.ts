import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER } from '../../../../common/audit/audit-recorder.port.js';
import type { AuditRecorder } from '../../../../common/audit/audit-recorder.port.js';
import {
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../../common/errors/domain.exception.js';
import { TRANSACTION_RUNNER } from '../../../../common/persistence/transaction.js';
import type { TransactionRunner } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { requireMember } from '../command-context.js';
import type { CommandContext } from '../command-context.js';
import { emptyToNull } from '../member-rules.js';
import type { NewPersonStudy, PersonStudyView } from '../member.models.js';
import { STUDY_REPOSITORY } from '../ports/member-details.repositories.js';
import type {
  NewStudyRecord,
  StudyRepository,
} from '../ports/member-details.repositories.js';
import { MEMBER_REPOSITORY } from '../ports/member.repository.js';
import type { MemberRepository } from '../ports/member.repository.js';
import { CATALOG_RESOLVER } from '../ports/person.repository.js';
import type { CatalogResolver } from '../ports/person.repository.js';

const MIN_YEAR = 1940;

async function validateAndResolveStudy(
  input: NewPersonStudy,
  catalogs: CatalogResolver,
  today: string,
): Promise<NewStudyRecord> {
  const name = input.name.trim();
  const institution = emptyToNull(input.institution);
  const currentYear = Number(today.slice(0, 4));

  if (name.length < 3 || name.length > 150) {
    throw new InvalidInputException(
      'Escribe el programa o título (entre 3 y 150 caracteres).',
    );
  }
  if (institution !== null && institution.length > 150) {
    throw new InvalidInputException(
      'La institución admite máximo 150 caracteres.',
    );
  }
  if (
    input.year !== null &&
    (!Number.isInteger(input.year) ||
      input.year < MIN_YEAR ||
      input.year > currentYear)
  ) {
    throw new InvalidInputException(
      `El año debe estar entre ${MIN_YEAR} y ${currentYear}.`,
    );
  }
  if (input.status === 'COMPLETED' && input.year === null) {
    throw new InvalidInputException(
      'Indica el año en que finalizó el estudio.',
    );
  }
  const studyTypeId = await catalogs.studyTypeId(input.studyTypeCode);
  if (studyTypeId === null) {
    throw new InvalidInputException('El tipo de estudio no es válido.');
  }

  return {
    studyTypeId,
    name,
    institution,
    status: input.status,
    year: input.year,
  };
}

@Injectable()
export class ListStudiesUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(STUDY_REPOSITORY) private readonly studies: StudyRepository,
  ) {}

  async execute(
    scope: TenantScope,
    memberId: number,
  ): Promise<PersonStudyView[]> {
    const member = await requireMember(this.members, scope, memberId);
    const studies = await this.studies.list(scope, member.personId);
    return [...studies].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }
}

@Injectable()
export class AddStudyUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(STUDY_REPOSITORY) private readonly studies: StudyRepository,
    @Inject(CATALOG_RESOLVER) private readonly catalogs: CatalogResolver,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    input: NewPersonStudy,
  ): Promise<void> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    const record = await validateAndResolveStudy(
      input,
      this.catalogs,
      this.clock.today(),
    );

    await this.transactions.run(async (transaction) => {
      const id = await this.studies.add(
        scope,
        member.personId,
        record,
        transaction,
      );
      if (id === null) {
        throw new ConflictDomainException(
          'Esta persona ya tiene registrado ese estudio.',
          'DUPLICATE_STUDY',
        );
      }
      await this.audit.record(
        {
          action: 'CREATED',
          entity: 'PersonStudy',
          entityId: id,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: { status: { from: null, to: input.status } },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
  }
}

@Injectable()
export class UpdateStudyUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(STUDY_REPOSITORY) private readonly studies: StudyRepository,
    @Inject(CATALOG_RESOLVER) private readonly catalogs: CatalogResolver,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    studyId: number,
    input: NewPersonStudy,
  ): Promise<void> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    const record = await validateAndResolveStudy(
      input,
      this.catalogs,
      this.clock.today(),
    );

    await this.transactions.run(async (transaction) => {
      const result = await this.studies.update!(
        scope,
        member.personId,
        studyId,
        record,
        transaction,
      );
      if (result === false) {
        throw new NotFoundDomainException('El estudio ya no existe.');
      }
      if (result === 'DUPLICATE') {
        throw new ConflictDomainException(
          'Esta persona ya tiene registrado ese estudio.',
          'DUPLICATE_STUDY',
        );
      }
      await this.audit.record(
        {
          action: 'UPDATED',
          entity: 'PersonStudy',
          entityId: studyId,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: { status: { from: null, to: input.status } },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
  }
}

@Injectable()
export class RemoveStudyUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(STUDY_REPOSITORY) private readonly studies: StudyRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    studyId: number,
  ): Promise<void> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    await this.transactions.run(async (transaction) => {
      const removed = await this.studies.remove(
        scope,
        member.personId,
        studyId,
        transaction,
      );
      if (!removed) {
        throw new NotFoundDomainException('El estudio ya no existe.');
      }
      await this.audit.record(
        {
          action: 'DELETED',
          entity: 'PersonStudy',
          entityId: studyId,
          actor: context.actor,
          congregationId: member.congregationId,
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
  }
}
