import type { Transporter } from 'nodemailer';
import { SmartLogger } from '../../common/logging/smart-logger.service.js';
import { MailMessage } from '../../common/mail/mailer.port.js';
import { LoggingMailer } from './logging.mailer.js';
import { NodemailerMailer } from './nodemailer.mailer.js';

const message: MailMessage = {
  kind: 'INVITATION',
  to: 'maria.perez@iglesia.org',
  subject: 'Invitación para Maria Pérez',
  text: 'Entra en https://app.example.org/login/accept-invitation?token=SECRET-TOKEN-123',
};

function createLogger() {
  const logger = { warn: vi.fn(), error: vi.fn() };
  return { logger, asLogger: logger as unknown as SmartLogger };
}

const SETTINGS = {
  host: 'smtp.example.org',
  secure: false,
  from: 'Iglesia 238 <no-reply@example.org>',
};

describe('LoggingMailer', () => {
  it('reports that nothing was delivered', async () => {
    const { asLogger } = createLogger();

    await expect(new LoggingMailer(asLogger).send(message)).resolves.toEqual({
      delivered: false,
    });
  });

  it('logs the kind of message, never the recipient, subject or link', async () => {
    const { logger, asLogger } = createLogger();

    await new LoggingMailer(asLogger).send(message);

    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain('INVITATION');
    expect(logged).not.toContain('maria');
    expect(logged).not.toContain('Invitación');
    expect(logged).not.toContain('SECRET-TOKEN');
  });
});

describe('NodemailerMailer', () => {
  it('hands the message to the transport with the configured sender', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const { asLogger } = createLogger();
    const mailer = new NodemailerMailer(SETTINGS, asLogger, {
      sendMail,
    } as unknown as Transporter);

    await expect(mailer.send(message)).resolves.toEqual({ delivered: true });

    expect(sendMail).toHaveBeenCalledWith({
      from: SETTINGS.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: undefined,
    });
  });

  it('reports a failure without throwing and without logging recipient or link', async () => {
    const failure = Object.assign(
      new Error(`550 mailbox ${message.to} unavailable ${message.text}`),
      { code: 'EENVELOPE' },
    );
    const sendMail = vi.fn(() => {
      throw failure;
    });
    const { logger, asLogger } = createLogger();
    const mailer = new NodemailerMailer(SETTINGS, asLogger, {
      sendMail,
    } as unknown as Transporter);

    await expect(mailer.send(message)).resolves.toEqual({ delivered: false });

    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).toContain('INVITATION');
    expect(logged).toContain('EENVELOPE');
    expect(logged).not.toContain('maria');
    expect(logged).not.toContain('SECRET-TOKEN');
  });

  it('builds a real transport from the settings without opening a connection', () => {
    const { asLogger } = createLogger();

    expect(
      () =>
        new NodemailerMailer(
          { ...SETTINGS, port: 465, secure: true, user: 'u', password: 'p' },
          asLogger,
        ),
    ).not.toThrow();
  });
});
