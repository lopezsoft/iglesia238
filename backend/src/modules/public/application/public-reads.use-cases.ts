import { Inject, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  hashTrackingCode,
  normalizeTrackingCode,
  TRACKING_CODE_PATTERN,
} from '../../membership-applications/domain/tracking-code.js';
import {
  toPublicStatus,
  type PublicStatusView,
} from '../domain/public-status.js';
import {
  PUBLIC_APPLICATIONS_STORE,
  type PublicApplicationsStore,
} from './ports/public-applications.store.js';
import {
  PUBLIC_DIRECTORY,
  type CurrentPolicyRecord,
  type OpenCongregationRecord,
  type PublicDirectory,
} from './ports/public-directory.reader.js';

/** Sedes the public form can offer. */
@Injectable()
export class ListOpenCongregationsUseCase {
  constructor(
    @Inject(PUBLIC_DIRECTORY) private readonly directory: PublicDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<readonly OpenCongregationRecord[]> {
    return this.directory.listOpenCongregations(this.clock.today());
  }
}

/** The policy an applicant of the denomination accepts today. */
@Injectable()
export class GetCurrentPolicyUseCase {
  constructor(
    @Inject(PUBLIC_DIRECTORY) private readonly directory: PublicDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(denominationId: number): Promise<CurrentPolicyRecord> {
    const policy = await this.directory.findCurrentPolicy(
      denominationId,
      this.clock.today(),
    );
    if (!policy) {
      throw new NotFoundDomainException(
        'Esta denominación no tiene una política de datos vigente.',
        'POLICY_NOT_AVAILABLE',
      );
    }
    return policy;
  }
}

const NOT_FOUND = 'No encontramos una solicitud con ese código.';

/**
 * Status of an application by its tracking code. A malformed code and an unknown one answer exactly
 * the same, so the route gives no hint about the shape of valid codes.
 */
@Injectable()
export class CheckApplicationStatusUseCase {
  constructor(
    @Inject(PUBLIC_APPLICATIONS_STORE)
    private readonly store: PublicApplicationsStore,
  ) {}

  async execute(trackingCode: string): Promise<PublicStatusView> {
    const code = normalizeTrackingCode(trackingCode);
    if (!TRACKING_CODE_PATTERN.test(code)) {
      throw new NotFoundDomainException(NOT_FOUND);
    }
    const stored = await this.store.findStatusByHash(hashTrackingCode(code));
    if (!stored) {
      throw new NotFoundDomainException(NOT_FOUND);
    }
    return toPublicStatus(stored);
  }
}
