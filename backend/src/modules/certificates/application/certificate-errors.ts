import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';

/** Stable codes of this module. The frontend maps them to messages, so they never change once published. */
export const CertificateErrorCode = {
  CERTIFICATE_NOT_FOUND: 'CERTIFICATE_NOT_FOUND',
  CERTIFICATE_NOT_VERIFIABLE: 'CERTIFICATE_NOT_VERIFIABLE',
  CERTIFICATE_TYPE_INVALID: 'CERTIFICATE_TYPE_INVALID',
  CERTIFICATE_TEMPLATE_INVALID: 'CERTIFICATE_TEMPLATE_INVALID',
  CERTIFICATE_TYPE_NOT_FOUND: 'CERTIFICATE_TYPE_NOT_FOUND',
  CERTIFICATE_ALREADY_VOIDED: 'CERTIFICATE_ALREADY_VOIDED',
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  MEMBER_NOT_ACTIVE: 'MEMBER_NOT_ACTIVE',
  MEMBER_NOT_BAPTIZED: 'MEMBER_NOT_BAPTIZED',
  MEMBER_NOT_REGISTERED: 'MEMBER_NOT_REGISTERED',
  NOTES_TOO_LONG: 'NOTES_TOO_LONG',
  PASTOR_REQUIRED: 'PASTOR_REQUIRED',
  VOID_REASON_REQUIRED: 'VOID_REASON_REQUIRED',
  CARD_NOT_FOUND: 'CARD_NOT_FOUND',
  CARD_ALREADY_VOIDED: 'CARD_ALREADY_VOIDED',
  CARD_NOT_VALID: 'CARD_NOT_VALID',
  ACTIVE_CARD_EXISTS: 'ACTIVE_CARD_EXISTS',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_EXPIRY: 'INVALID_EXPIRY',
} as const;

export const NOTES_MAX_LENGTH = 255;
export const VOID_REASON_MIN_LENGTH = 10;
export const VOID_REASON_MAX_LENGTH = 255;
/** A valid card that expires within these days is flagged as "about to expire". */
export const CARD_EXPIRY_WARNING_DAYS = 30;
/** Suggested validity of a new card; the client only uses it to prefill the form. */
export const DEFAULT_CARD_VALIDITY_YEARS = 2;
export const SUPERSEDED_CARD_REASON =
  'Reemplazado por un carné de la nueva sede tras el traslado.';

export const certificateNotFound = () =>
  new NotFoundDomainException(
    'El certificado no existe o pertenece a otra sede.',
    CertificateErrorCode.CERTIFICATE_NOT_FOUND,
  );

/** A malformed token, a wrong signature and an unknown certificate answer the same: the caller learns nothing. */
export const certificateNotVerifiable = () =>
  new NotFoundDomainException(
    'No pudimos verificar este documento: el código no es válido o el documento no existe.',
    CertificateErrorCode.CERTIFICATE_NOT_VERIFIABLE,
  );

export const certificateTypeInvalid = (message: string) =>
  new InvalidInputException(
    message,
    CertificateErrorCode.CERTIFICATE_TYPE_INVALID,
  );

export const certificateTemplateInvalid = (message: string) =>
  new InvalidInputException(
    message,
    CertificateErrorCode.CERTIFICATE_TEMPLATE_INVALID,
  );

export const certificateTypeNotFound = () =>
  new NotFoundDomainException(
    'El tipo de certificado no existe en esta denominación.',
    CertificateErrorCode.CERTIFICATE_TYPE_NOT_FOUND,
  );

/** A member of another congregation or denomination looks the same as one that does not exist. */
export const memberNotFound = () =>
  new NotFoundDomainException(
    'El miembro no existe en esta sede.',
    CertificateErrorCode.MEMBER_NOT_FOUND,
  );

export const cardNotFound = () =>
  new NotFoundDomainException(
    'El carné no existe o pertenece a otra sede.',
    CertificateErrorCode.CARD_NOT_FOUND,
  );

export const memberNotActive = () =>
  new BusinessRuleException(
    'Solo se emiten documentos a miembros activos.',
    CertificateErrorCode.MEMBER_NOT_ACTIVE,
  );

export const memberNotBaptized = () =>
  new BusinessRuleException(
    'El certificado de bautismo solo se emite a miembros con el bautismo registrado.',
    CertificateErrorCode.MEMBER_NOT_BAPTIZED,
  );

export const memberNotRegistered = () =>
  new BusinessRuleException(
    'El miembro no tiene número en el libro de esta sede.',
    CertificateErrorCode.MEMBER_NOT_REGISTERED,
  );

export const notesTooLong = () =>
  new InvalidInputException(
    `Las observaciones admiten máximo ${NOTES_MAX_LENGTH} caracteres.`,
    CertificateErrorCode.NOTES_TOO_LONG,
  );

export const pastorRequired = () =>
  new BusinessRuleException(
    'La sede no tiene un pastor vigente que firme el documento. Regístralo en Registros de secretaría, periodos pastorales.',
    CertificateErrorCode.PASTOR_REQUIRED,
  );

export const voidReasonRequired = () =>
  new InvalidInputException(
    `Escribe el motivo de la anulación (entre ${VOID_REASON_MIN_LENGTH} y ${VOID_REASON_MAX_LENGTH} caracteres).`,
    CertificateErrorCode.VOID_REASON_REQUIRED,
  );

export const certificateAlreadyVoided = () =>
  new ConflictDomainException(
    'El certificado ya estaba anulado.',
    CertificateErrorCode.CERTIFICATE_ALREADY_VOIDED,
  );

export const cardAlreadyVoided = () =>
  new ConflictDomainException(
    'El carné ya estaba anulado.',
    CertificateErrorCode.CARD_ALREADY_VOIDED,
  );

export const cardNotValid = () =>
  new BusinessRuleException(
    'Solo se anulan carnés vigentes.',
    CertificateErrorCode.CARD_NOT_VALID,
  );

export const activeCardExists = () =>
  new ConflictDomainException(
    'El miembro ya tiene un carné vigente. Anúlalo antes de emitir uno nuevo.',
    CertificateErrorCode.ACTIVE_CARD_EXISTS,
  );

export const invalidDate = (message: string) =>
  new InvalidInputException(message, CertificateErrorCode.INVALID_DATE);

export const invalidExpiry = () =>
  new BusinessRuleException(
    'El vencimiento debe ser posterior a la fecha de emisión.',
    CertificateErrorCode.INVALID_EXPIRY,
  );

/** Trims and validates the reason of a void. */
export function requireVoidReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim();
  if (
    trimmed.length < VOID_REASON_MIN_LENGTH ||
    trimmed.length > VOID_REASON_MAX_LENGTH
  ) {
    throw voidReasonRequired();
  }
  return trimmed;
}
