import {
  MailDeliveryResult,
  MailMessage,
  Mailer,
} from '../../common/mail/mailer.port.js';
import { SmartLogger } from '../../common/logging/smart-logger.service.js';

/**
 * Used when SMTP is not configured. It records only that a message of some kind was not sent: never the
 * recipient, the subject or the body, which would leak the one-time links.
 */
export class LoggingMailer implements Mailer {
  readonly isConfigured = false;

  constructor(private readonly logger: SmartLogger) {}

  send(message: MailMessage): Promise<MailDeliveryResult> {
    this.logger.warn(
      `Mail "${message.kind}" was not sent: SMTP is not configured`,
      LoggingMailer.name,
    );
    return Promise.resolve({ delivered: false });
  }
}
