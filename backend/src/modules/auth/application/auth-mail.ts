import type { MailMessage } from '../../../common/mail/mailer.port.js';

/** Link of the page where a person sets a new password with a recovery token. */
export function passwordResetLink(appBaseUrl: string, token: string): string {
  return `${appBaseUrl}/login/reset-password?token=${encodeURIComponent(token)}`;
}

/** Link of the page where an invited person creates their password. */
export function invitationLink(appBaseUrl: string, token: string): string {
  return `${appBaseUrl}/login/accept-invitation?token=${encodeURIComponent(token)}`;
}

/** Link of the page that confirms the e-mail address of a new account. */
export function emailVerificationLink(
  appBaseUrl: string,
  token: string,
): string {
  return `${appBaseUrl}/login/verify-email?token=${encodeURIComponent(token)}`;
}

/** Confirmation e-mail. The link is the only secret in it: it never reaches a log. */
export function emailVerificationMessage(
  to: string,
  link: string,
  validHours: number,
): MailMessage {
  return {
    to,
    kind: 'EMAIL_VERIFICATION',
    subject: 'Confirma tu correo en Iglesia 238',
    text: [
      'Gracias por registrarte en Iglesia 238.',
      '',
      `Confirma tu correo con este enlace (funciona una sola vez y vence en ${validHours} horas):`,
      link,
      '',
      'Si no fuiste tú, ignora este mensaje.',
    ].join('\n'),
    html: [
      '<p>Gracias por registrarte en Iglesia 238.</p>',
      `<p>Confirma tu correo con este enlace (funciona una sola vez y vence en ${validHours} horas):</p>`,
      `<p><a href="${link}">Confirmar mi correo</a></p>`,
      '<p>Si no fuiste tú, ignora este mensaje.</p>',
    ].join('\n'),
  };
}

/** Sent when someone tries to register with an address that already has an account. It has no links. */
export function registrationNoticeMessage(to: string): MailMessage {
  return {
    to,
    kind: 'REGISTRATION_NOTICE',
    subject: 'Intentaron registrar una sede con tu correo en Iglesia 238',
    text: [
      'Alguien intentó registrar una sede en Iglesia 238 con este correo, pero ya tienes una cuenta.',
      '',
      'No se creó nada ni se cambió tu cuenta. Si fuiste tú, inicia sesión; si olvidaste tu contraseña, usa «Olvidé mi contraseña».',
      'Si no fuiste tú, puedes ignorar este mensaje.',
    ].join('\n'),
    html: [
      '<p>Alguien intentó registrar una sede en Iglesia 238 con este correo, pero ya tienes una cuenta.</p>',
      '<p>No se creó nada ni se cambió tu cuenta. Si fuiste tú, inicia sesión; si olvidaste tu contraseña, usa «Olvidé mi contraseña».</p>',
      '<p>Si no fuiste tú, puedes ignorar este mensaje.</p>',
    ].join('\n'),
  };
}

export function passwordResetMessage(
  to: string,
  link: string,
  validMinutes: number,
): MailMessage {
  return {
    to,
    kind: 'PASSWORD_RESET',
    subject: 'Recupera tu contraseña de Iglesia 238',
    text: [
      'Recibimos una solicitud para cambiar tu contraseña de Iglesia 238.',
      '',
      `Usa este enlace en los próximos ${validMinutes} minutos (funciona una sola vez):`,
      link,
      '',
      'Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.',
    ].join('\n'),
    html: [
      '<p>Recibimos una solicitud para cambiar tu contraseña de Iglesia 238.</p>',
      `<p>Usa este enlace en los próximos ${validMinutes} minutos (funciona una sola vez):</p>`,
      `<p><a href="${link}">Crear una contraseña nueva</a></p>`,
      '<p>Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.</p>',
    ].join('\n'),
  };
}
