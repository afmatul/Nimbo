import { Inject, Injectable } from '@nestjs/common';

import { I_MAILER } from '../application/ports/i-mailer.port';
import type { IMailer, MailMessage } from '../application/ports/i-mailer.port';
import type { INotifier } from '../application/ports/i-notifier.port';

/**
 * `INotifier` por correo (spec 009, decisión 4): solo encola en `mail` con el mismo `IMailer`, así la clave de
 * idempotencia (`jobId`) y las bitácoras sin datos personales son las del correo de `identity`.
 */
@Injectable()
export class MailNotifier implements INotifier {
  constructor(@Inject(I_MAILER) private readonly mailer: IMailer) {}

  notify(message: MailMessage): Promise<void> {
    return this.mailer.send(message);
  }
}
