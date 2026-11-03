export const MAILER = Symbol('MAILER');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Non-sensitive identifier of the kind of message (INVITATION, PASSWORD_RESET). It is the only part of
   * a message that may appear in logs: recipient, subject and body can hold personal data and links.
   */
  kind: string;
}

export interface MailDeliveryResult {
  /**
   * True when the message was handed to the mail server. False when mail is not configured or the
   * server refused it: the caller then shows the one-time link to the user who triggered the action.
   */
  delivered: boolean;
}

/** Port for outgoing mail. It never throws for a delivery problem: it reports delivered = false. */
export interface Mailer {
  send(message: MailMessage): Promise<MailDeliveryResult>;
}
