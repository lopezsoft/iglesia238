import {
  InvalidInputException,
  NotFoundDomainException,
  ServiceUnavailableDomainException,
} from '../../../common/errors/domain.exception.js';

/** Stable codes of this module. The frontend maps them to messages, so they never change once published. */
export const BrandingErrorCode = {
  LOGO_INVALID: 'LOGO_INVALID',
  LOGO_TOO_LARGE: 'LOGO_TOO_LARGE',
  LOGO_FORMAT_UNSUPPORTED: 'LOGO_FORMAT_UNSUPPORTED',
  LOGO_DIMENSIONS_INVALID: 'LOGO_DIMENSIONS_INVALID',
  LOGO_NOT_EMBEDDABLE: 'LOGO_NOT_EMBEDDABLE',
  LOGO_NOT_FOUND: 'LOGO_NOT_FOUND',
  COLOR_INVALID: 'COLOR_INVALID',
  COLOR_LOW_CONTRAST: 'COLOR_LOW_CONTRAST',
  STORAGE_UNAVAILABLE: 'BRANDING_STORAGE_UNAVAILABLE',
} as const;

export const logoInvalid = (message: string) =>
  new InvalidInputException(message, BrandingErrorCode.LOGO_INVALID);

export const logoTooLarge = (maxKilobytes: number) =>
  new InvalidInputException(
    `El logo pesa demasiado: máximo ${maxKilobytes} KB. Reduce la imagen o expórtala con menos calidad.`,
    BrandingErrorCode.LOGO_TOO_LARGE,
  );

export const logoFormatUnsupported = () =>
  new InvalidInputException(
    'El logo debe ser una imagen PNG o JPEG. SVG, GIF y WebP no se admiten.',
    BrandingErrorCode.LOGO_FORMAT_UNSUPPORTED,
  );

export const logoDimensionsInvalid = (min: number, max: number) =>
  new InvalidInputException(
    `El logo debe medir entre ${min} y ${max} píxeles por lado.`,
    BrandingErrorCode.LOGO_DIMENSIONS_INVALID,
  );

export const logoNotEmbeddable = () =>
  new InvalidInputException(
    'No se pudo incrustar este logo en un documento PDF. El archivo parece dañado: expórtalo de nuevo como PNG o JPEG estándar.',
    BrandingErrorCode.LOGO_NOT_EMBEDDABLE,
  );

export const logoNotFound = () =>
  new NotFoundDomainException('No hay logo.', BrandingErrorCode.LOGO_NOT_FOUND);

export const colorInvalid = () =>
  new InvalidInputException(
    'El color debe escribirse como #RRGGBB, por ejemplo #1F56C4.',
    BrandingErrorCode.COLOR_INVALID,
  );

export const colorLowContrast = (ratio: number, minimum: number) =>
  new InvalidInputException(
    `El color es demasiado claro: el texto de los documentos no se leería sobre él (contraste ${ratio.toFixed(1)}:1; el mínimo es ${minimum}:1). Elige un tono más oscuro.`,
    BrandingErrorCode.COLOR_LOW_CONTRAST,
  );

export const storageUnavailable = () =>
  new ServiceUnavailableDomainException(
    'No se pudo guardar el archivo en este momento. Intenta de nuevo en unos minutos; si continúa, avisa al administrador del sistema.',
    BrandingErrorCode.STORAGE_UNAVAILABLE,
  );
