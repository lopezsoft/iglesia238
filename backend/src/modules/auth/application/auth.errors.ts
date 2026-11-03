import {
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
  UnauthenticatedException,
} from '../../../common/errors/domain.exception.js';
import { AuthErrorCode } from './auth.policy.js';

/** 401 with one message for "unknown email", "wrong password" and "disabled account". */
export class InvalidCredentialsException extends UnauthenticatedException {
  constructor() {
    super(
      'Correo o contraseña incorrectos.',
      AuthErrorCode.INVALID_CREDENTIALS,
    );
  }
}

/** 403: the account exists but has no role that can be used. */
export class NoActiveRolesException extends ForbiddenDomainException {
  constructor() {
    super(
      'Tu cuenta no tiene accesos vigentes. Pide a tu administrador que te asigne un rol.',
      AuthErrorCode.NO_ACTIVE_ROLES,
    );
  }
}

/** 400: a one-time recovery link that is unknown, used or expired. */
export class InvalidRecoveryLinkException extends InvalidInputException {
  constructor() {
    super(
      'El enlace no es válido o ya venció. Solicita uno nuevo.',
      AuthErrorCode.TOKEN_INVALID_OR_EXPIRED,
    );
  }
}

/** 404: an invitation link that is unknown, used, expired or already activated. */
export class InvalidInvitationException extends NotFoundDomainException {
  constructor() {
    super(
      'El enlace de invitación no es válido o venció. Pide una nueva a tu administrador.',
      AuthErrorCode.INVITATION_INVALID,
    );
  }
}

/** 400 (never 401: the frontend would take it for an expired session). */
export class InvalidCurrentPasswordException extends InvalidInputException {
  constructor() {
    super(
      'La contraseña actual no es correcta.',
      AuthErrorCode.INVALID_CURRENT_PASSWORD,
    );
  }
}
