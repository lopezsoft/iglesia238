import type { MailMessage } from '../../../common/mail/mailer.port.js';

/** Link of the page where a person sets a new password with a recovery token. */
export function passwordResetLink(appBaseUrl: string, token: string): string {
  return `${appBaseUrl}/login/reset-password?token=${encodeURIComponent(token)}`;
}

/** Link of the page where an invited person creates their password. */
export function invitationLink(appBaseUrl: string, token: string): string {
  return `${appBaseUrl}/login/accept-invitation?token=${encodeURIComponent(token)}`;
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
