import type { ITransactionRunner } from '../../../shared';

import type { BillingLogger } from './billing-logger';
import type { IDueSubscriptionScanner } from './ports/i-due-subscription.scanner.port';
import type { RenewalReminderService } from './renewal-reminder.service';
import { RenewalRunIncompleteError, RenewalRunner } from './renewal-runner';
import type { RenewalResult, SubscriptionRenewer } from './subscription-renewer';

const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';
const CARLA = '33333333-3333-4333-8333-333333333333';

interface SetupOptions {
  readonly due?: readonly string[];
  readonly toRemind?: readonly string[];
  readonly results?: Readonly<Record<string, RenewalResult | Error>>;
}

const setup = ({ due = [], toRemind = [], results = {} }: SetupOptions = {}) => {
  const scopes: string[] = [];
  const transactions: ITransactionRunner = {
    run: (work) => (scopes.push('sin actor'), work()),
    withActor: () => Promise.reject(new Error('la pasada lista sin actor')),
  };
  const scanner: IDueSubscriptionScanner = {
    listDueForRenewal: jest.fn().mockResolvedValue(due),
    listDueForReminder: jest.fn().mockResolvedValue(toRemind),
  };
  const renewer = {
    renew: jest.fn(({ id }: { id: string }) => {
      const result = results[id] ?? 'renewed';
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    }),
  } as unknown as SubscriptionRenewer;
  const reminders = {
    remind: jest.fn().mockResolvedValue(true),
  } as unknown as RenewalReminderService;
  const logger: BillingLogger = { info: jest.fn(), error: jest.fn() };
  const runner = new RenewalRunner(
    transactions,
    scanner,
    renewer,
    reminders,
    { intervalMinutes: 15, batchSize: 100 },
    3,
    logger,
  );
  return { runner, scanner, renewer, reminders, logger, scopes };
};

describe('RenewalRunner.runOnce (spec 010 CA-1 a CA-5, CA-23)', () => {
  it('CA-23: lista sin actor, delega como cada dueño y deja solo conteos en la bitácora', async () => {
    const { runner, scanner, renewer, logger, scopes } = setup({
      due: [ANA, BRUNO, CARLA],
      toRemind: [ANA],
      results: { [BRUNO]: 'rejected', [CARLA]: 'noticeResent' },
    });

    await runner.runOnce();

    expect(scopes).toEqual(['sin actor', 'sin actor']);
    expect(scanner.listDueForRenewal).toHaveBeenCalledWith(100);
    expect(scanner.listDueForReminder).toHaveBeenCalledWith(3, 100);
    expect(renewer.renew).toHaveBeenCalledWith(
      expect.objectContaining({ id: ANA, role: 'CLIENT' }),
    );
    expect(logger.info).toHaveBeenCalledWith({
      event: 'billing.renewal_run',
      scanned: 3,
      renewed: 1,
      rejected: 1,
      readOnly: 0,
      downgraded: 0,
      noticeResent: 1,
      skipped: 0,
      reminded: 1,
      failed: 0,
    });
    expect(JSON.stringify(jest.mocked(logger.info).mock.calls)).not.toContain(ANA);
  });

  it('CA-4: un fallo no frena a las demás; la pasada falla al final con el nombre y el `code`, sin ids', async () => {
    const down = Object.assign(new Error(`conexión de ${ANA}`), { code: '57P01' });
    const { runner, renewer, logger } = setup({ due: [ANA, BRUNO], results: { [ANA]: down } });

    await expect(runner.runOnce()).rejects.toMatchObject({
      constructor: RenewalRunIncompleteError,
      failed: 1,
    });
    expect(renewer.renew).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith({
      event: 'billing.renewal_failed',
      errorName: 'Error',
      code: '57P01',
    });
    expect(JSON.stringify(jest.mocked(logger.error).mock.calls)).not.toContain(ANA);
  });

  it('CA-5: un aviso que ya no hace falta no se cuenta', async () => {
    const { runner, reminders, logger } = setup({ toRemind: [ANA] });
    jest.mocked(reminders.remind).mockResolvedValueOnce(false);

    await runner.runOnce();

    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ reminded: 0 }));
  });
});
