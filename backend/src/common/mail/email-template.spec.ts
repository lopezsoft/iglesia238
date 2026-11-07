import {
  emailVerificationMessage,
  passwordResetMessage,
  registrationNoticeMessage,
} from '../../modules/auth/application/auth-mail.js';
import {
  invitationMessage,
  recoveryNoticeMessage,
} from '../../modules/users/application/invitations.use-cases.js';
import { escapeHtml, renderTransactionalEmailHtml } from './email-template.js';

describe('Transactional email HTML templates', () => {
  it('escapes HTML special characters in dynamic text and links', () => {
    expect(escapeHtml('<script>"alert(\'xss\')&"</script>')).toBe(
      '&lt;script&gt;&quot;alert(&#39;xss&#39;)&amp;&quot;&lt;/script&gt;',
    );

    const html = renderTransactionalEmailHtml({
      preheader: 'Preheader <unsafe>',
      badgeText: 'Badge & Co',
      heading: 'Heading "quoted"',
      paragraphs: ['Paragraph with <tag> & entities'],
      action: {
        label: 'Activar <ahora>',
        url: 'https://app.iglesia238.com/login/accept-invitation?token=abc&x=1',
        validityNote: 'Vence en <72h>',
      },
      securityNote: 'Nota <segura>',
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Iglesia 238');
    expect(html).toContain('Plataforma de Gestión Eclesiástica');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<unsafe>');
    expect(html).toContain('Preheader &lt;unsafe&gt;');
    expect(html).toContain(
      'href="https://app.iglesia238.com/login/accept-invitation?token=abc&amp;x=1"',
    );
  });

  it('renders rich branded HTML templates for all 5 transactional email types', () => {
    const invitation = invitationMessage(
      'pastor@iglesia.org',
      'https://app.iglesia238.com/login/accept-invitation?token=tok-123',
    );
    expect(invitation.html).toContain('<!DOCTYPE html>');
    expect(invitation.html).toContain('Invitación de acceso');
    expect(invitation.html).toContain('Crear mi contraseña');
    expect(invitation.html).toContain('tok-123');

    const verification = emailVerificationMessage(
      'pastor@iglesia.org',
      'https://app.iglesia238.com/login/verify-email?token=ver-456',
      72,
    );
    expect(verification.html).toContain('Verificación de correo');
    expect(verification.html).toContain('Confirmar mi correo');
    expect(verification.html).toContain('ver-456');

    const reset = passwordResetMessage(
      'pastor@iglesia.org',
      'https://app.iglesia238.com/login/reset-password?token=rst-789',
      30,
    );
    expect(reset.html).toContain('Recuperación de acceso');
    expect(reset.html).toContain('Crear una contraseña nueva');
    expect(reset.html).toContain('rst-789');

    const regNotice = registrationNoticeMessage('pastor@iglesia.org');
    expect(regNotice.html).toContain('Aviso de seguridad');
    expect(regNotice.html).not.toContain('href=');

    const recNotice = recoveryNoticeMessage('pastor@iglesia.org');
    expect(recNotice.html).toContain('Aviso de seguridad');
    expect(recNotice.html).not.toContain('href=');
  });
});
