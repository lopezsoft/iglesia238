import nodemailer, { Transporter } from 'nodemailer';
import { SmartLogger } from '../../common/logging/smart-logger.service.js';
import {
  MailDeliveryResult,
  MailMessage,
  Mailer,
} from '../../common/mail/mailer.port.js';

export interface SmtpSettings {
  host: string;
  port?: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

const SOCKET_TIMEOUT_MS = 15_000;

/** SMTP adapter. A delivery failure is logged without recipient or content and reported, not thrown. */
export class NodemailerMailer implements Mailer {
  readonly isConfigured = true;
  private readonly transporter: Transporter;

  constructor(
    private readonly settings: SmtpSettings,
    private readonly logger: SmartLogger,
    transporter?: Transporter,
  ) {
    this.transporter =
      transporter ??
      nodemailer.createTransport({
        host: settings.host,
        port: settings.port ?? (settings.secure ? 465 : 587),
        secure: settings.secure,
        auth:
          settings.user && settings.password
            ? { user: settings.user, pass: settings.password }
            : undefined,
        connectionTimeout: SOCKET_TIMEOUT_MS,
        greetingTimeout: SOCKET_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
      });
  }

  async send(message: MailMessage): Promise<MailDeliveryResult> {
    try {
      await this.transporter.sendMail({
        from: this.settings.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { delivered: true };
    } catch (error) {
      // The error text can include the recipient or the server reply; only its code is kept.
      const code = (error as { code?: unknown }).code;
      this.logger.error(
        `Mail "${message.kind}" could not be delivered (${typeof code === 'string' ? code : 'unknown error'})`,
        NodemailerMailer.name,
      );
      return { delivered: false };
    }
  }
}
