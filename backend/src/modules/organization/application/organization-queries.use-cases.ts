import { Inject, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { sortDistricts } from './districts.use-cases.js';
import { denominationScopeOf, districtLabel } from './organization-rules.js';
import {
  DISTRICT_REPOSITORY,
  LEGAL_ENTITY_REPOSITORY,
  ORGANIZATION_OVERVIEW_READER,
  type DistrictRepository,
  type LegalEntityRepository,
  type OrganizationCounts,
  type OrganizationOverviewReader,
} from './organization.ports.js';
import { compareSpanish } from '../../../common/text/comparable-text.js';

export interface SelectOptionView {
  readonly id: number;
  readonly label: string;
  readonly isActive: boolean;
}

export interface CongregationFormOptionsView {
  readonly legalEntities: readonly SelectOptionView[];
  readonly districts: readonly SelectOptionView[];
}

@Injectable()
export class GetOrganizationOverviewUseCase {
  constructor(
    @Inject(ORGANIZATION_OVERVIEW_READER)
    private readonly reader: OrganizationOverviewReader,
  ) {}

  async execute(context: TenantContext): Promise<OrganizationCounts> {
    const counts = await this.reader.read(denominationScopeOf(context));
    if (!counts) {
      throw new NotFoundDomainException('La denominación no existe.');
    }
    return counts;
  }
}

/** Choices of the selects of the sede form. */
@Injectable()
export class GetCongregationFormOptionsUseCase {
  constructor(
    @Inject(LEGAL_ENTITY_REPOSITORY)
    private readonly legalEntities: LegalEntityRepository,
    @Inject(DISTRICT_REPOSITORY) private readonly districts: DistrictRepository,
  ) {}

  async execute(context: TenantContext): Promise<CongregationFormOptionsView> {
    const scope = denominationScopeOf(context);
    const [legalEntities, districts] = await Promise.all([
      this.legalEntities.list(scope),
      this.districts.list(scope),
    ]);
    return {
      legalEntities: legalEntities
        .map((row) => ({
          id: row.id,
          label: row.legalName,
          isActive: row.isActive,
        }))
        .sort((a, b) => compareSpanish(a.label, b.label)),
      districts: sortDistricts(districts).map((row) => ({
        id: row.id,
        label: districtLabel(row),
        isActive: true,
      })),
    };
  }
}
