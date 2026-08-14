import { Inject, Injectable, Logger } from '@nestjs/common';

import { APP_CONFIG } from 'src/common/config/config.module';
import { AppConfig } from 'src/common/config/configuration';

export interface OutboundMail {
  to: string;
  subject: string;
  /** Plain text only. Nothing here is rendered as HTML by any transport. */
  body: string;
}

/**
 * Outbound mail, with one transport implemented.
 *
 * `log` writes the message to the server log and reports that nothing was
 * delivered. That is deliberately honest: a password-reset link that silently
 * vanishes is worse than one an operator has to read out of the log, and every
 * caller checks `delivered` so the UI can tell the truth too.
 *
 * To add real delivery: implement an `SmtpTransport` here, allow 'smtp' in
 * `MAIL_TRANSPORT`, and select it below. The config enum rejects 'smtp' today so
 * nobody can configure a transport that does not exist and believe mail is going
 * out.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** False when the message was recorded but not actually delivered. */
  async send(mail: OutboundMail): Promise<{ delivered: boolean }> {
    // Awaited by callers and by future transports; the log transport is sync.
    await Promise.resolve();

    this.logger.warn(
      `No mail transport configured — not delivered. to=${mail.to} subject="${mail.subject}"\n${mail.body}`,
    );
    return { delivered: false };
  }

  /** Absolute link into the web app, for messages that carry one. */
  appUrl(path: string): string {
    const base = this.config.APP_URL.replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }
}
