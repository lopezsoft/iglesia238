import type { Transaction } from '../../../../common/persistence/transaction.js';

export const CONGREGATION_REGISTRATION_STORE = Symbol(
  'CONGREGATION_REGISTRATION_STORE',
);

/** Legal entity a new congregation can attach to: active, of an active denomination and an active country. */
export interface RegistrationLegalEntity {
  readonly id: number;
  readonly denominationId: number;
  readonly legalName: string;
  /** The sede is registered in this country: its municipality is looked up here. */
  readonly countryId: number;
}

export interface NewRegisteredCongregation {
  readonly denominationId: number;
  readonly legalEntityId: number;
  readonly name: string;
  /** Unique inside the denomination. */
  readonly code: string;
  readonly municipalityId: number;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
}

export interface NewRegisteredManager {
  readonly email: string;
  readonly displayName: string;
  /** Hash from the PasswordHasher: the plain password never reaches the store. */
  readonly passwordHash: string;
}

export interface RegistrationCommand {
  readonly congregation: NewRegisteredCongregation;
  readonly manager: NewRegisteredManager;
  /** Roles granted on the new congregation (scope C:<id>). */
  readonly roleCodes: readonly string[];
  /** SHA-256 of the confirmation token (EMAIL_VERIFICATION). */
  readonly verification: {
    readonly tokenHash: string;
    readonly expiresAt: Date;
  };
}

export interface RegistrationResult {
  readonly congregationId: number;
  readonly userId: number;
  readonly assignments: readonly { id: number; roleCode: string }[];
}

/** The e-mail got an account between the check and the insert (two registrations at the same time). */
export class DuplicateRegistrationEmailError extends Error {
  constructor() {
    super('The e-mail already belongs to an account');
  }
}

/**
 * Everything the self-registration of a congregation reads and writes. `register` creates the
 * congregation, the user, its roles and its confirmation token inside the caller's transaction, so
 * either all of it exists or none.
 */
export interface CongregationRegistrationStore {
  findActiveLegalEntity(id: number): Promise<RegistrationLegalEntity | null>;
  /** Name and code of every congregation of the denomination (not deleted): to detect repeats and number codes. */
  listCongregationIdentifiers(
    denominationId: number,
  ): Promise<readonly { name: string; code: string }[]>;
  /** Codes are unique per region, not worldwide: the lookup is always inside the country. */
  findMunicipalityId(countryId: number, code: string): Promise<number | null>;
  /** Any account with that address, deleted or not (the column is unique for all rows). */
  emailExists(email: string): Promise<boolean>;
  /** @throws DuplicateRegistrationEmailError when the e-mail was taken meanwhile. */
  register(
    command: RegistrationCommand,
    transaction: Transaction,
  ): Promise<RegistrationResult>;
}
