import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { IDueSubscriptionScanner } from '../../application/ports/i-due-subscription.scanner.port';

const TO_RENEW_SQL = 'SELECT usuario_id FROM suscripciones_por_renovar($1)';
const TO_REMIND_SQL = 'SELECT usuario_id FROM suscripciones_por_avisar($1, $2)';

/**
 * `IDueSubscriptionScanner` sobre Postgres (spec 010 plan §3; ADR-0021). Usa el `EntityManager` de
 * `ITransactionRunner.run` (sin actor: las funciones fallan con uno) y devuelve solo UUID; renovar y avisar lo hacen
 * `SubscriptionRenewer` y `RenewalReminderService` como cada dueño.
 */
@Injectable()
export class SqlDueSubscriptionScanner implements IDueSubscriptionScanner {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  listDueForRenewal(limit: number): Promise<readonly string[]> {
    return this.ids(TO_RENEW_SQL, [limit]);
  }

  listDueForReminder(days: number, limit: number): Promise<readonly string[]> {
    return this.ids(TO_REMIND_SQL, [days, limit]);
  }

  private async ids(sql: string, params: readonly number[]): Promise<readonly string[]> {
    const rows = (await this.context.manager().query(sql, [...params])) as { usuario_id: string }[];
    return rows.map((row) => row.usuario_id);
  }
}
