import { Inject, Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import { ENV } from '../../../shared';
import type { MailMessage } from '../application/ports/i-mailer.port';

/** Variables `SMTP_*` y `MAIL_FROM` del esquema del `worker` (001 plan §6.10); el `api` no las tiene. */
export interface SmtpEnv {
  readonly SMTP_HOST: string;
  readonly SMTP_PORT: number;
  readonly SMTP_TLS: 'none' | 'starttls' | 'implicit';
  readonly SMTP_USER?: string | undefined;
  readonly SMTP_PASSWORD?: string | undefined;
  readonly MAIL_FROM: string;
}

/** Dominio del `Message-ID` determinista (ADR-0018, tercera capa de idempotencia). */
const MESSAGE_ID_DOMAIN = 'nimbo.me';

/**
 * Tiempos de espera por debajo del bloqueo de 30 s de un trabajo de BullMQ: un SMTP colgado no deja el trabajo
 * «estancado» (BullMQ lo daría por perdido y otro intento podría entregar dos veces).
 */
const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

/** `none`: sin TLS (solo local; el esquema lo prohíbe en staging). `starttls`: exige STARTTLS. `implicit`: TLS desde el inicio. */
const TLS_OPTIONS: Readonly<Record<SmtpEnv['SMTP_TLS'], SMTPTransport.Options>> = {
  none: { secure: false, ignoreTLS: true },
  starttls: { secure: false, requireTLS: true },
  implicit: { secure: true },
};

const buildOptions = (env: SmtpEnv): SMTPTransport.Options => ({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  ...TLS_OPTIONS[env.SMTP_TLS],
  ...(env.SMTP_USER === undefined
    ? {}
    : { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } }),
  connectionTimeout: CONNECTION_TIMEOUT_MS,
  greetingTimeout: GREETING_TIMEOUT_MS,
  socketTimeout: SOCKET_TIMEOUT_MS,
});

/**
 * Envoltorio de nodemailer (ADR-0018) que usa el `worker`. Lee `SMTP_*` y `MAIL_FROM` del entorno validado del
 * proceso. Los errores de nodemailer se propagan tal cual (conservan `code` y `responseCode`); quien los registra
 * nunca usa su `message`, que incluye la dirección del destinatario (D-18).
 */
@Injectable()
export class SmtpTransport {
  private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private readonly from: string;

  constructor(@Inject(ENV) env: SmtpEnv) {
    this.transporter = createTransport(buildOptions(env));
    this.from = env.MAIL_FROM;
  }

  async deliver(message: MailMessage, jobId: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: `<${jobId}@${MESSAGE_ID_DOMAIN}>`,
    });
  }
}
