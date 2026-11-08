// Pure rules of the editable part of a certificate type: what may be saved, and how it is normalized.

import {
  certificateTemplateInvalid,
  certificateTypeInvalid,
} from './certificate-errors.js';
import { templateProblems } from './certificate-document.js';
import type { CertificateTypeChanges } from './certificate.models.js';

export const TYPE_NAME_MIN_LENGTH = 3;
export const TYPE_NAME_MAX_LENGTH = 100;
export const VALIDITY_DAYS_MAX = 3650;

/** Length limit of each customizable text; they match the columns of certificate_types. */
export const TEMPLATE_LIMITS = {
  template: 2000,
  introTemplate: 500,
  closingTemplate: 500,
  pastorTitleTemplate: 120,
  secretaryTitleTemplate: 120,
} as const;

type TemplateField = keyof typeof TEMPLATE_LIMITS;

const FIELD_LABELS: Readonly<Record<TemplateField, string>> = {
  template: 'El cuerpo',
  introTemplate: 'El encabezado',
  closingTemplate: 'El cierre',
  pastorTitleTemplate: 'El título del pastor',
  secretaryTitleTemplate: 'El título de la secretaría',
};

/** A blank text means "use the default": it is stored as null. */
function normalizedText(
  field: TemplateField,
  value: string | null,
): string | null {
  const text = value?.trim() ?? '';
  if (text === '') {
    return null;
  }
  const label = FIELD_LABELS[field];
  if (text.length > TEMPLATE_LIMITS[field]) {
    throw certificateTemplateInvalid(
      `${label} admite máximo ${TEMPLATE_LIMITS[field]} caracteres.`,
    );
  }
  const { unknown, malformed } = templateProblems(text);
  if (unknown.length > 0) {
    throw certificateTemplateInvalid(
      `${label} usa marcadores que no existen: ${unknown.map((key) => `{{${key}}}`).join(', ')}.`,
    );
  }
  if (malformed) {
    throw certificateTemplateInvalid(
      `${label} tiene llaves sin cerrar o que no forman un marcador. Escribe los marcadores como {{memberName}}.`,
    );
  }
  return text;
}

/** Validates and normalizes the changes of a type. Only the fields that came in are in the result. */
export function validatedTypeChanges(
  input: CertificateTypeChanges,
): CertificateTypeChanges {
  const changes: {
    -readonly [K in keyof CertificateTypeChanges]: CertificateTypeChanges[K];
  } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (
      name.length < TYPE_NAME_MIN_LENGTH ||
      name.length > TYPE_NAME_MAX_LENGTH
    ) {
      throw certificateTypeInvalid(
        `El nombre del tipo debe tener entre ${TYPE_NAME_MIN_LENGTH} y ${TYPE_NAME_MAX_LENGTH} caracteres.`,
      );
    }
    changes.name = name;
  }

  if (input.validityDays !== undefined) {
    const days = input.validityDays;
    if (
      days !== null &&
      (!Number.isInteger(days) || days < 1 || days > VALIDITY_DAYS_MAX)
    ) {
      throw certificateTypeInvalid(
        `La vigencia debe ser un número de días entre 1 y ${VALIDITY_DAYS_MAX}, o vacía si el certificado no vence.`,
      );
    }
    changes.validityDays = days;
  }

  for (const field of Object.keys(TEMPLATE_LIMITS) as TemplateField[]) {
    const value = input[field];
    if (value !== undefined) {
      changes[field] = normalizedText(field, value);
    }
  }
  return changes;
}
