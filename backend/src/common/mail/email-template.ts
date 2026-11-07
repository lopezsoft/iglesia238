export type EmailBadgeTone = 'primary' | 'success' | 'warning';

export interface TransactionalEmailTemplateInput {
  /** Preheader text shown in inbox previews next to the subject line. */
  readonly preheader: string;
  /** Short uppercase badge label shown above the heading. */
  readonly badgeText: string;
  /** Visual accent of the badge. Defaults to 'primary'. */
  readonly badgeTone?: EmailBadgeTone;
  /** Main heading inside the email card. */
  readonly heading: string;
  /** Body paragraphs rendered in order. */
  readonly paragraphs: readonly string[];
  /** Optional primary call-to-action button. */
  readonly action?: {
    readonly label: string;
    readonly url: string;
    readonly validityNote?: string;
    /** Whether to show the raw URL fallback box below the button (true by default). */
    readonly showFallbackUrl?: boolean;
  };
  /** Highlighted callout or security note shown at the bottom of the card. */
  readonly securityNote: string;
}

const BADGE_STYLES: Record<
  EmailBadgeTone,
  { background: string; border: string; text: string }
> = {
  primary: {
    background: '#eff6ff',
    border: '#bfdbfe',
    text: '#1d4ed8',
  },
  success: {
    background: '#ecfdf5',
    border: '#a7f3d0',
    text: '#047857',
  },
  warning: {
    background: '#fffbeb',
    border: '#fde68a',
    text: '#b45309',
  },
};

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders a responsive, table-based transactional HTML email template compatible with
 * Gmail (Web/iOS/Android), Outlook, Apple Mail and Yahoo Mail.
 */
export function renderTransactionalEmailHtml(
  input: TransactionalEmailTemplateInput,
): string {
  const badgeStyle = BADGE_STYLES[input.badgeTone ?? 'primary'];
  const preheader = escapeHtml(input.preheader);
  const badgeText = escapeHtml(input.badgeText);
  const heading = escapeHtml(input.heading);
  const securityNote = escapeHtml(input.securityNote);

  const paragraphsHtml = input.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#334155;">${escapeHtml(paragraph)}</p>`,
    )
    .join('\n');

  const actionHtml = input.action
    ? renderActionBlock(
        input.action.label,
        input.action.url,
        input.action.validityNote,
        input.action.showFallbackUrl ?? true,
      )
    : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${heading}</title>`,
    '</head>',
    '<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-font-smoothing:antialiased;">',
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;width:100%;margin:0;padding:32px 16px;">',
    '  <tr>',
    '    <td align="center">',
    '      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 10px 25px -5px rgba(15,23,42,0.06);">',
    '        <!-- Brand Header -->',
    '        <tr>',
    '          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);background-color:#1e3a8a;padding:26px 36px;">',
    '            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    '              <tr>',
    '                <td align="left" valign="middle">',
    '                  <span style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;text-decoration:none;">Iglesia 238</span>',
    '                  <span style="display:block;margin-top:3px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;color:#93c5fd;letter-spacing:0.04em;text-transform:uppercase;">Plataforma de Gestión Eclesiástica</span>',
    '                </td>',
    '              </tr>',
    '            </table>',
    '          </td>',
    '        </tr>',
    '        <!-- Main Content -->',
    '        <tr>',
    '          <td style="padding:36px 36px 28px 36px;">',
    '            <div style="margin-bottom:16px;">',
    `              <span style="display:inline-block;padding:5px 12px;border-radius:999px;background-color:${badgeStyle.background};border:1px solid ${badgeStyle.border};color:${badgeStyle.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${badgeText}</span>`,
    '            </div>',
    `            <h1 style="margin:0 0 18px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.3;letter-spacing:-0.02em;color:#0f172a;">${heading}</h1>`,
    paragraphsHtml,
    actionHtml,
    '            <!-- Security Note -->',
    '            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:18px;">',
    '              <tr>',
    '                <td>',
    `                  <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#64748b;">${securityNote}</p>`,
    '                </td>',
    '              </tr>',
    '            </table>',
    '          </td>',
    '        </tr>',
    '        <!-- Footer -->',
    '        <tr>',
    '          <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:22px 36px;text-align:center;">',
    '            <p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#475569;">Iglesia 238 · Gestión Ministerial, Administrativa y Contable</p>',
    '            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#94a3b8;">Este es un correo automático de seguridad enviado desde no-reply@iglesia238.com.<br>Por favor no respondas directamente a esta dirección.</p>',
    '          </td>',
    '        </tr>',
    '      </table>',
    '    </td>',
    '  </tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('\n');
}

function renderActionBlock(
  label: string,
  url: string,
  validityNote: string | undefined,
  showFallbackUrl: boolean,
): string {
  const safeLabel = escapeHtml(label);
  const safeUrl = escapeHtml(url);
  const validityHtml = validityNote
    ? `<p style="margin:12px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;color:#64748b;">${escapeHtml(validityNote)}</p>`
    : '';
  const fallbackHtml = showFallbackUrl
    ? [
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">',
        '  <tr>',
        '    <td style="padding:14px 16px;">',
        '      <p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#475569;">¿El botón no se abre al hacer clic?</p>',
        '      <p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#64748b;">Copia y pega el siguiente enlace directamente en tu navegador:</p>',
        `      <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.5;word-break:break-all;color:#1d4ed8;"><a href="${safeUrl}" style="color:#1d4ed8;text-decoration:underline;">${safeUrl}</a></p>`,
        '    </td>',
        '  </tr>',
        '</table>',
      ].join('\n')
    : '';

  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px 0;">',
    '  <tr>',
    '    <td align="left">',
    `      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#1d4ed8;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.2;text-decoration:none;padding:14px 28px;border-radius:10px;box-shadow:0 4px 12px rgba(29,78,216,0.22);">${safeLabel}</a>`,
    validityHtml,
    '    </td>',
    '  </tr>',
    '</table>',
    fallbackHtml,
  ].join('\n');
}
