import { toIsoDateTime } from '../../../common/mappers/value-mappers.js';
import type {
  CongregationRecord,
  DistrictRecord,
  LegalEntityRecord,
} from './organization.ports.js';

export interface CongregationView {
  readonly id: number;
  readonly denominationId: number;
  readonly legalEntityId: number;
  readonly legalEntityName: string;
  readonly districtId: number | null;
  readonly districtNumber: string | null;
  readonly code: string;
  readonly name: string;
  readonly municipalityCode: string | null;
  readonly municipalityName: string | null;
  readonly regionCode?: string | null;
  readonly regionName: string | null;
  readonly neighborhood: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly acceptsApplications: boolean;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface LegalEntityView {
  readonly id: number;
  readonly denominationId: number;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string;
  readonly legalRepresentative: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly countryId: number;
  readonly countryName: string;
  readonly municipalityCode: string | null;
  readonly municipalityName: string | null;
  readonly regionCode?: string | null;
  readonly regionName: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface DistrictView {
  readonly id: number;
  readonly denominationId: number;
  readonly number: string;
  readonly name: string | null;
  readonly congregationNames: readonly string[];
}

export function toCongregationView(
  record: CongregationRecord,
): CongregationView {
  return { ...record, createdAt: toIsoDateTime(record.createdAt) };
}

export function toLegalEntityView(record: LegalEntityRecord): LegalEntityView {
  return { ...record, createdAt: toIsoDateTime(record.createdAt) };
}

export function toDistrictView(record: DistrictRecord): DistrictView {
  return { ...record };
}
