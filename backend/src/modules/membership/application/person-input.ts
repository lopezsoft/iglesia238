import {
  ConflictDomainException,
  InvalidInputException,
} from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import { ageOn, emptyToNull } from './member-rules.js';
import { PersonData, ResolvedPersonData } from './member.models.js';
import type {
  CatalogKind,
  CatalogResolver,
} from './ports/person.repository.js';
import type { PersonRepository } from './ports/person.repository.js';
import { normalizeDocument } from './person-text.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { Transaction } from '../../../common/persistence/transaction.js';

const DOCUMENT_NUMBER = /^[A-Z0-9]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AGE = 120;

const CATALOG_LABELS: Readonly<Record<CatalogKind, string>> = {
  documentType: 'El tipo de documento',
  maritalStatus: 'El estado civil',
  educationLevel: 'El nivel educativo',
  municipality: 'El municipio',
};

/** Trims text, turns empty strings into null, lower-cases the e-mail and normalizes the document. */
export function normalizePersonData(input: PersonData): PersonData {
  const documentNumber = emptyToNull(input.documentNumber);
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    secondLastName: emptyToNull(input.secondLastName),
    documentTypeCode: emptyToNull(input.documentTypeCode),
    documentNumber: documentNumber ? normalizeDocument(documentNumber) : null,
    birthDate: emptyToNull(input.birthDate),
    sex: input.sex,
    maritalStatusCode: emptyToNull(input.maritalStatusCode),
    educationLevelCode: emptyToNull(input.educationLevelCode),
    profession: emptyToNull(input.profession),
    occupation: emptyToNull(input.occupation),
    phone: emptyToNull(input.phone),
    email: emptyToNull(input.email)?.toLowerCase() ?? null,
    address: emptyToNull(input.address),
    municipalityCode: emptyToNull(input.municipalityCode),
  };
}

/** Business validation of a person; format and length are already checked by the DTO. */
export function validatePersonData(data: PersonData, today: string): void {
  if (data.firstName === '') {
    throw new InvalidInputException('Escribe los nombres de la persona.');
  }
  if (data.lastName === '') {
    throw new InvalidInputException(
      'Escribe el primer apellido de la persona.',
    );
  }
  if ((data.documentTypeCode === null) !== (data.documentNumber === null)) {
    throw new InvalidInputException(
      'El tipo y el número de documento van juntos.',
    );
  }
  if (
    data.documentNumber !== null &&
    !DOCUMENT_NUMBER.test(data.documentNumber)
  ) {
    throw new InvalidInputException(
      'El número de documento solo admite letras y números (3 a 30 caracteres).',
    );
  }
  if (data.birthDate !== null) {
    if (!isIsoDate(data.birthDate) || data.birthDate > today) {
      throw new InvalidInputException(
        'La fecha de nacimiento no es válida.',
        'INVALID_DATE',
      );
    }
    if ((ageOn(data.birthDate, today) ?? 0) > MAX_AGE) {
      throw new InvalidInputException(
        'La fecha de nacimiento no es válida.',
        'INVALID_DATE',
      );
    }
  }
  if (data.email !== null && !EMAIL.test(data.email)) {
    throw new InvalidInputException('El correo electrónico no es válido.');
  }
}

/** Resolves the catalog codes of the person; an unknown code is a 400 with a clear message. */
export async function resolvePersonData(
  catalogs: CatalogResolver,
  data: PersonData,
): Promise<ResolvedPersonData> {
  const { ids, unknown } = await catalogs.resolve(data);
  if (unknown.length > 0) {
    throw new InvalidInputException(
      `${CATALOG_LABELS[unknown[0]]} no es válido.`,
    );
  }
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    secondLastName: data.secondLastName,
    birthDate: data.birthDate,
    sex: data.sex,
    profession: data.profession,
    occupation: data.occupation,
    phone: data.phone,
    email: data.email,
    address: data.address,
    documentNumber: data.documentNumber,
    ...ids,
  };
}

/**
 * The document is unique per denomination. The message never says whose document it is: a
 * congregation-scoped user must not learn about persons of other congregations.
 */
export async function assertDocumentAvailable(
  persons: PersonRepository,
  scope: TenantScope,
  resolved: ResolvedPersonData,
  exceptPersonId: number | null,
  transaction?: Transaction,
): Promise<void> {
  if (resolved.documentTypeId === null || resolved.documentNumber === null) {
    return;
  }
  const duplicate = await persons.findByDocument(
    scope,
    resolved.documentTypeId,
    resolved.documentNumber,
    exceptPersonId,
    transaction,
  );
  if (duplicate) {
    throw new ConflictDomainException(
      'Ya existe otra persona con ese documento en la denominación.',
      'DUPLICATE_DOCUMENT',
    );
  }
}
