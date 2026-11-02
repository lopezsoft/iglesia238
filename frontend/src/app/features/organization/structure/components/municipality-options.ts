import { DEMO_MUNICIPALITIES, Municipality } from '../../../../core/models/catalogs';

export interface MunicipalityGroup {
  readonly regionName: string;
  readonly municipalities: readonly Municipality[];
}

/** Municipalities grouped by department, for <optgroup>. */
export const MUNICIPALITY_GROUPS: readonly MunicipalityGroup[] = [
  ...new Set(DEMO_MUNICIPALITIES.map((municipality) => municipality.regionName)),
]
  .sort((a, b) => a.localeCompare(b, 'es'))
  .map((regionName) => ({
    regionName,
    municipalities: DEMO_MUNICIPALITIES.filter(
      (municipality) => municipality.regionName === regionName,
    ).sort((a, b) => a.name.localeCompare(b.name, 'es')),
  }));
