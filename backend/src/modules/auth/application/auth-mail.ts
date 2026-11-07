import { renderTransactionalEmailHtml } from '../../../common/mail/email-template.js';
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
    html: renderTransactionalEmailHtml({
      preheader: `Confirma tu dirección de correo electrónico para activar tu cuenta en Iglesia 238.`,
      badgeText: 'Verificación de correo',
      badgeTone: 'success',
      heading: 'Confirma tu correo en Iglesia 238',
      paragraphs: [
        'Gracias por registrarte en Iglesia 238. Estás a un solo paso de activar el entorno de gestión ministerial, administrativa y contable de tu congregación.',
        'Haz clic en el siguiente botón para verificar tu dirección de correo electrónico:',
      ],
      action: {
        label: 'Confirmar mi correo',
        url: link,
        validityNote: `Enlace de un solo uso · Vence en ${validHours} horas.`,
      },
      securityNote:
        'Si no realizaste este registro en Iglesia 238, puedes ignorar este mensaje con tranquilidad.',
    }),
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
    html: renderTransactionalEmailHtml({
      preheader:
        'Aviso de seguridad sobre un intento de registro con tu dirección de correo en Iglesia 238.',
      badgeText: 'Aviso de seguridad',
      badgeTone: 'warning',
      heading: 'Intento de registro con tu correo electrónico',
      paragraphs: [
        'Alguien intentó registrar una sede en Iglesia 238 con esta dirección de correo electrónico, pero ya tienes una cuenta registrada en la plataforma.',
        'Por tu seguridad, no se creó ningún registro nuevo ni se modificó tu cuenta actual. Si fuiste tú, inicia sesión directamente; si olvidaste tu contraseña, usa la opción «Olvidé mi contraseña».',
      ],
      securityNote:
        'Si no intentaste realizar este registro, puedes ignorar este mensaje; tu cuenta permanece protegida.',
    }),
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
    html: renderTransactionalEmailHtml({
      preheader: `Enlace de un solo uso para restablecer tu contraseña en Iglesia 238 (válido por ${validMinutes} minutos).`,
      badgeText: 'Recuperación de acceso',
      badgeTone: 'primary',
      heading: 'Recupera tu contraseña de Iglesia 238',
      paragraphs: [
        'Recibimos una solicitud para cambiar la contraseña de tu cuenta en Iglesia 238.',
        'Para definir una contraseña nueva de forma segura, haz clic en el siguiente botón:',
      ],
      action: {
        label: 'Crear una contraseña nueva',
        url: link,
        validityNote: `Enlace de un solo uso · Vence en ${validMinutes} minutos.`,
      },
      securityNote:
        'Si no solicitaste este cambio, ignora este mensaje: tu contraseña actual no cambiará y tu cuenta sigue protegida.',
    }),
  };
}
