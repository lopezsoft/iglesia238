import type { Transaction } from '../../../../common/persistence/transaction.js';
import {
  DuplicateRegistrationEmailError,
  type CongregationRegistrationStore,
  type RegistrationCommand,
  type RegistrationLegalEntity,
  type RegistrationResult,
} from '../ports/congregation-registration.store.js';

export interface StoredRegistration {
  congregationId: number;
  userId: number;
  command: RegistrationCommand;
}

/** Test-only countries. */
export const REGISTRATION_COUNTRY_ID = 48;
export const OTHER_REGISTRATION_COUNTRY_ID = 64;

interface LegalEntityRow extends RegistrationLegalEntity {
  isActive: boolean;
  denominationIsActive: boolean;
}

interface CongregationRow {
  denominationId: number;
  name: string;
  code: string;
}

/** The tables the self-registration touches, in memory. Rolled back by hand when `failNext` is set. */
export class InMemoryRegistrationWorld implements CongregationRegistrationStore {
  legalEntities: LegalEntityRow[] = [
    {
      id: 12,
      denominationId: 1,
      legalName: 'Corporación Uno',
      countryId: REGISTRATION_COUNTRY_ID,
      isActive: true,
      denominationIsActive: true,
    },
    {
      id: 13,
      denominationId: 1,
      legalName: 'Corporación Inactiva',
      countryId: REGISTRATION_COUNTRY_ID,
      isActive: false,
      denominationIsActive: true,
    },
    {
      id: 22,
      denominationId: 2,
      legalName: 'Corporación Dos',
      countryId: REGISTRATION_COUNTRY_ID,
      isActive: true,
      denominationIsActive: true,
    },
    {
      id: 32,
      denominationId: 3,
      legalName: 'Denominación Cerrada',
      countryId: REGISTRATION_COUNTRY_ID,
      isActive: true,
      denominationIsActive: false,
    },
  ];
  congregations: CongregationRow[] = [
    { denominationId: 1, name: 'Sede Central', code: 'SC' },
  ];
  /** `<countryId>:<code>` -> municipality id. 1701 only exists in the other country. */
  municipalities = new Map<string, number>([
    [`${REGISTRATION_COUNTRY_ID}:13001`, 1],
    [`${OTHER_REGISTRATION_COUNTRY_ID}:1701`, 2],
  ]);
  emails = new Set<string>(['existente@iglesia.org']);
  registrations: StoredRegistration[] = [];
  /** Imitates losing the race for the e-mail between the check and the insert. */
  raceOnEmail = false;
  /** Lets an end-to-end test mirror the new rows into the fakes of other modules (accounts, roles). */
  onRegistered?: (registration: StoredRegistration) => void;
  private nextId = 100;

  findActiveLegalEntity(id: number): Promise<RegistrationLegalEntity | null> {
    const row = this.legalEntities.find(
      (entity) =>
        entity.id === id && entity.isActive && entity.denominationIsActive,
    );
    return Promise.resolve(
      row
        ? {
            id: row.id,
            denominationId: row.denominationId,
            legalName: row.legalName,
            countryId: row.countryId,
          }
        : null,
    );
  }

  listCongregationIdentifiers(denominationId: number) {
    return Promise.resolve(
      this.congregations.filter((row) => row.denominationId === denominationId),
    );
  }

  findMunicipalityId(countryId: number, code: string): Promise<number | null> {
    return Promise.resolve(
      this.municipalities.get(`${countryId}:${code}`) ?? null,
    );
  }

  emailExists(email: string): Promise<boolean> {
    return Promise.resolve(this.emails.has(email));
  }

  register(
    command: RegistrationCommand,
    _transaction: Transaction,
  ): Promise<RegistrationResult> {
    void _transaction;
    if (this.raceOnEmail || this.emails.has(command.manager.email)) {
      return Promise.reject(new DuplicateRegistrationEmailError());
    }
    const userId = (this.nextId += 1);
    const congregationId = (this.nextId += 1);
    this.emails.add(command.manager.email);
    this.congregations.push({
      denominationId: command.congregation.denominationId,
      name: command.congregation.name,
      code: command.congregation.code,
    });
    const registration = { congregationId, userId, command };
    this.registrations.push(registration);
    this.onRegistered?.(registration);
    return Promise.resolve({
      congregationId,
      userId,
      assignments: command.roleCodes.map((roleCode) => ({
        id: (this.nextId += 1),
        roleCode,
      })),
    });
  }
}
