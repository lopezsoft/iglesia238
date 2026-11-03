import {
  BusinessRuleException,
  ConflictDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';

/** Another tenant's application looks exactly like a missing one: 404, never 403. */
export const applicationNotFound = () =>
  new NotFoundDomainException(
    'La solicitud no existe o no pertenece a tu sede.',
  );

export const invalidTransition = (
  message = 'La solicitud ya fue resuelta y no admite cambios.',
) => new ConflictDomainException(message, 'INVALID_TRANSITION');

export const duplicateDocument = () =>
  new ConflictDomainException(
    'Ya existe una persona con este documento en la denominación. Enlaza la solicitud a esa persona o recházala para que se corrija el documento.',
    'DUPLICATE_DOCUMENT',
  );

export const invalidMatch = () =>
  new BusinessRuleException(
    'La persona indicada no coincide con el documento de la solicitud.',
    'INVALID_MATCH',
  );
