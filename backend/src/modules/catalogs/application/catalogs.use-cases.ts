import { Inject, Injectable } from '@nestjs/common';
import {
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  CATALOGS_READER,
  type CatalogsReader,
  type CountryView,
  type EnsuredNeighborhood,
  type GlobalCatalogs,
  type MunicipalityKey,
  type MunicipalityView,
  type NeighborhoodView,
  type PublicCatalogs,
  type RegionView,
} from './catalogs.reader.js';

/** Permission that administers the countries; it also lets a session list the inactive ones. */
export const COUNTRIES_MANAGE_PERMISSION = 'denominations.manage';

export const DEFAULT_MUNICIPALITY_LIMIT = 20;
export const MAX_MUNICIPALITY_LIMIT = 50;
export const MAX_SEARCH_LENGTH = 80;
export const MIN_NEIGHBORHOOD_LENGTH = 2;
export const MAX_NEIGHBORHOOD_LENGTH = 120;

const MUNICIPALITY_NOT_FOUND = 'El municipio no existe.';

function clampLimit(limit: number | undefined): number {
  const requested = limit ?? DEFAULT_MUNICIPALITY_LIMIT;
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_MUNICIPALITY_LIMIT);
}

function cleanSearch(search: string | undefined): string | null {
  const value = search?.trim().slice(0, MAX_SEARCH_LENGTH);
  return value ? value : null;
}

/** GET /catalogs and GET /public/catalogs. */
@Injectable()
export class GetCatalogsUseCase {
  constructor(
    @Inject(CATALOGS_READER) private readonly reader: CatalogsReader,
  ) {}

  all(): Promise<GlobalCatalogs> {
    return this.reader.listGlobalCatalogs();
  }

  /** Only what the public form shows: nothing about meetings or studies leaves the sign-in wall. */
  async publicSubset(): Promise<PublicCatalogs> {
    const { documentTypes, maritalStatuses } =
      await this.reader.listGlobalCatalogs();
    return { documentTypes, maritalStatuses };
  }
}

/** GET /geo/countries: the active countries; the inactive ones too for whoever administers them. */
@Injectable()
export class ListCountriesUseCase {
  constructor(
    @Inject(CATALOGS_READER) private readonly reader: CatalogsReader,
  ) {}

  async execute(
    includeInactive: boolean,
    tenant: TenantContext | null,
  ): Promise<CountryView[]> {
    if (
      includeInactive &&
      !(
        tenant?.kind === 'PLATFORM' &&
        tenant.hasAll(COUNTRIES_MANAGE_PERMISSION)
      )
    ) {
      throw new ForbiddenDomainException(
        'Solo el equipo de plataforma puede ver los países inactivos.',
      );
    }
    return this.reader.listCountries(includeInactive);
  }
}

/** GET /geo/regions and GET /public/geo/regions: regions (departamentos/estados) of an active country. */
@Injectable()
export class ListRegionsUseCase {
  constructor(
    @Inject(CATALOGS_READER) private readonly reader: CatalogsReader,
  ) {}

  execute(countryId: number): Promise<RegionView[]> {
    return this.reader.listRegions(countryId);
  }
}

/** Municipalities of active countries only, optionally of one country and/or region. */
@Injectable()
export class SearchMunicipalitiesUseCase {
  constructor(
    @Inject(CATALOGS_READER) private readonly reader: CatalogsReader,
  ) {}

  execute(
    search: string | undefined,
    limit: number | undefined,
    countryId: number | undefined = undefined,
    regionCode: string | undefined = undefined,
  ): Promise<MunicipalityView[]> {
    const normalizedRegion = regionCode?.trim() || null;
    return this.reader.searchMunicipalities(
      cleanSearch(search),
      clampLimit(limit),
      countryId ?? null,
      ...(normalizedRegion === null ? [] : [normalizedRegion]),
    );
  }
}

function keyOf(code: string, countryId: number | undefined): MunicipalityKey {
  return { code, countryId: countryId ?? null };
}

@Injectable()
export class GetMunicipalityUseCase {
  constructor(
    @Inject(CATALOGS_READER) private readonly reader: CatalogsReader,
  ) {}

  async execute(
    code: string,
    countryId: number | undefined = undefined,
  ): Promise<MunicipalityView> {
    const municipality = await this.reader.findMunicipality(
      keyOf(code, countryId),
    );
    if (!municipality) {
      throw new NotFoundDomainException(MUNICIPALITY_NOT_FOUND);
    }
    return municipality;
  }
}

@Injectable()
export class ListNeighborhoodsUseCase {
  constructor(
    @Inject(CATALOGS_READER) private readonly reader: CatalogsReader,
  ) {}

  async execute(
    municipalityCode: string,
    search: string | undefined,
    limit: number | undefined,
    countryId: number | undefined = undefined,
  ): Promise<NeighborhoodView[]> {
    const neighborhoods = await this.reader.listNeighborhoods(
      keyOf(municipalityCode, countryId),
      cleanSearch(search),
      clampLimit(limit),
    );
    if (!neighborhoods) {
      throw new NotFoundDomainException(MUNICIPALITY_NOT_FOUND);
    }
    return neighborhoods;
  }
}

/** Neighborhoods are typed by people, so the first one to write a name creates it for everybody. */
@Injectable()
export class EnsureNeighborhoodUseCase {
  constructor(
    @Inject(CATALOGS_READER) private readonly reader: CatalogsReader,
  ) {}

  async execute(
    municipalityCode: string,
    rawName: string,
    countryId: number | undefined = undefined,
  ): Promise<EnsuredNeighborhood> {
    const name = rawName.replace(/\s+/g, ' ').trim();
    if (
      name.length < MIN_NEIGHBORHOOD_LENGTH ||
      name.length > MAX_NEIGHBORHOOD_LENGTH
    ) {
      throw new InvalidInputException(
        `El nombre del barrio debe tener entre ${MIN_NEIGHBORHOOD_LENGTH} y ${MAX_NEIGHBORHOOD_LENGTH} caracteres.`,
      );
    }
    const neighborhood = await this.reader.ensureNeighborhood(
      keyOf(municipalityCode, countryId),
      name,
    );
    if (!neighborhood) {
      throw new NotFoundDomainException(MUNICIPALITY_NOT_FOUND);
    }
    return neighborhood;
  }
}
