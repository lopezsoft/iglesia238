// Public (anonymous) registration of a congregation, mirroring the API under /api/public.

/** A legal entity (razón social) a new congregation can be registered under. The NIT arrives masked. */
export interface PublicLegalEntity {
  readonly id: number;
  readonly legalName: string;
  readonly tradeName: string | null;
  /** NIT with the middle digits hidden, e.g. `900.***.**6-7`. */
  readonly taxIdMasked: string;
  readonly denominationId: number;
  readonly denominationName: string;
  /** Country of the legal entity: the municipality of the new sede must be of this country. */
  readonly countryId: number;
  readonly countryName: string;
}

/** The legal entities of one church (denomination), in the order they are listed. */
export interface LegalEntityGroup {
  readonly denominationId: number;
  readonly denominationName: string;
  readonly entities: readonly PublicLegalEntity[];
}

export interface RegistrationCongregation {
  readonly name: string;
  /** Required: a municipality of the country of the legal entity. */
  readonly municipalityCode: string;
  readonly address?: string;
  readonly phone?: string;
  readonly email?: string;
}

/** The person who administers the new congregation: their own user is created with it. */
export interface RegistrationManager {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

/** Body of POST /public/congregation-registrations. */
export interface CongregationRegistration {
  readonly legalEntityId: number;
  readonly congregation: RegistrationCongregation;
  readonly manager: RegistrationManager;
}

/** Answer of the API: the congregation is active at once; the manager must still confirm the e-mail. */
export interface RegistrationReceipt {
  readonly emailVerificationRequired: boolean;
  readonly congregationName: string;
  /** Only when the server has no SMTP (development): the confirmation link, to open by hand. */
  readonly devVerificationLink: string | null;
}

/** Max lengths of the Prisma columns the form feeds. */
export const REGISTRATION_LIMITS = {
  congregationName: 150,
  address: 200,
  phone: 30,
  email: 191,
  displayName: 150,
} as const;

/** Groups the legal entities by church, both sorted by name (accent-insensitive). */
export function groupLegalEntities(entities: readonly PublicLegalEntity[]): LegalEntityGroup[] {
  const byName = (a: string, b: string): number => a.localeCompare(b, 'es', { sensitivity: 'base' });
  const groups = new Map<number, { denominationName: string; entities: PublicLegalEntity[] }>();
  for (const entity of entities) {
    const group = groups.get(entity.denominationId);
    if (group) {
      group.entities.push(entity);
    } else {
      groups.set(entity.denominationId, { denominationName: entity.denominationName, entities: [entity] });
    }
  }
  return [...groups.entries()]
    .map(([denominationId, group]) => ({
      denominationId,
      denominationName: group.denominationName,
      entities: group.entities.sort((a, b) => byName(a.legalName, b.legalName)),
    }))
    .sort((a, b) => byName(a.denominationName, b.denominationName));
}
