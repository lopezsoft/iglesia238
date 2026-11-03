// Organization context, mirroring backend/prisma/schema/organization.prisma.

export interface Denomination {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface LegalEntity {
  readonly id: number;
  readonly denominationId: number;
  readonly legalName: string;
  readonly tradeName: string | null;
  /** NIT. */
  readonly taxId: string;
  readonly legalRepresentative: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  /** Country the legal entity belongs to; its sedes and its municipality must be of this country. */
  readonly countryId: number;
  readonly municipalityCode: string | null;
  readonly isActive: boolean;
}

export interface District {
  readonly id: number;
  readonly denominationId: number;
  readonly number: string;
  readonly name: string | null;
}

export interface Congregation {
  readonly id: number;
  readonly denominationId: number;
  readonly legalEntityId: number;
  readonly districtId: number | null;
  readonly municipalityCode: string | null;
  readonly neighborhood: string | null;
  readonly name: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  /** False hides the congregation from the public membership form. */
  readonly acceptsApplications: boolean;
  readonly isActive: boolean;
}
