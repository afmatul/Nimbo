import {
  OPTIMIZER_ERROR_CODES,
  STORAGE_ERROR_CODES,
  type OptimizationStatus,
} from '@nimbo/contracts';

import { messageForCode } from '../../../lib/error-catalog';
import { StorageRequestError } from '../../storage/storage-request-error';
import type { OptimizerApi } from '../optimizer-api';
import { OPTIMIZATION_MESSAGES } from '../optimizer-messages';

export interface OptimizationSnapshot {
  readonly optimization: OptimizationStatus | null;
  readonly loading: boolean;
  readonly pending: 'estimate' | 'run' | null;
  readonly error: string | null;
  readonly stale: boolean;
  readonly hidden: boolean;
  readonly unavailable: boolean;
}

export const INITIAL_OPTIMIZATION: OptimizationSnapshot = {
  optimization: null,
  loading: true,
  pending: null,
  error: null,
  stale: false,
  hidden: false,
  unavailable: false,
};

interface PollingOptions {
  readonly api: OptimizerApi;
  readonly fileId: string;
  readonly publish: (state: OptimizationSnapshot) => void;
  readonly onCompleted: (status: OptimizationStatus) => void;
}

/** Una sesión por archivo: invalida lecturas antiguas y conserva un único timeout, nunca un setInterval. */
export class FileOptimizationPolling {
  private state = INITIAL_OPTIMIZATION;
  private alive = true;
  private ticket = 0;
  private failures = 0;
  private staleId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: PollingOptions) {}

  private update(patch: Partial<OptimizationSnapshot>): void {
    if (!this.alive) return;
    this.state = { ...this.state, ...patch };
    this.options.publish(this.state);
  }

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.clearTimer();
    const delay = this.state.optimization?.pollAfterMs;
    if (!this.alive || document.visibilityState !== 'visible' || delay == null) return;
    this.timer = setTimeout(() => void this.load(), delay * 2 ** Math.min(this.failures, 3));
  }

  private accept(next: OptimizationStatus | null): void {
    const previous = this.state.optimization;
    const obsolete = next?.state === 'estimada' && next.id === this.staleId;
    this.failures = 0;
    // Una lectura válida desmiente un 403/404 o un tipo no soportado anteriores: la tarjeta vuelve a mostrarse.
    this.update({
      optimization: obsolete ? null : next,
      loading: false,
      error: null,
      hidden: false,
      unavailable: false,
    });
    if (
      next?.state === 'completada' &&
      previous?.state === 'optimizando' &&
      previous.id === next.id
    ) {
      this.options.onCompleted(next);
    }
  }

  readonly load = async (): Promise<void> => {
    this.clearTimer();
    if (!this.alive || document.visibilityState !== 'visible' || this.state.pending !== null)
      return;
    const mine = ++this.ticket;
    try {
      const next = await this.options.api.status(this.options.fileId);
      if (!this.alive || mine !== this.ticket) return;
      this.accept(next);
    } catch (error) {
      if (!this.alive || mine !== this.ticket) return;
      this.failures += 1;
      this.handleError(error);
    }
    this.schedule();
  };

  private handleError(error: unknown): void {
    if (error instanceof StorageRequestError) {
      if (error.status === 403 || error.status === 404) {
        this.update({ loading: false, optimization: null, hidden: true });
        return;
      }
      if (error.code === OPTIMIZER_ERROR_CODES.OPTIMIZER_UNSUPPORTED_TYPE) {
        this.update({ loading: false, optimization: null, unavailable: true });
        return;
      }
      this.update({ loading: false, error: messageForCode(error.code) });
      return;
    }
    this.update({ loading: false, error: OPTIMIZATION_MESSAGES.service });
  }

  private async stale(): Promise<void> {
    this.staleId = this.state.optimization?.id ?? null;
    this.update({ optimization: null, stale: true, pending: null });
    await this.load();
  }

  private async submit(
    action: 'estimate' | 'run',
    request: () => Promise<OptimizationStatus>,
  ): Promise<void> {
    if (!this.alive || this.state.pending !== null) return;
    this.clearTimer();
    this.ticket += 1;
    this.update({ pending: action, error: null, stale: false });
    try {
      const next = await request();
      if (this.alive) this.accept(next);
    } catch (error) {
      if (!this.alive) return;
      await this.handleSubmitError(error);
    } finally {
      this.update({ pending: null });
      this.schedule();
    }
  }

  private async handleSubmitError(error: unknown): Promise<void> {
    if (
      error instanceof StorageRequestError &&
      error.code === OPTIMIZER_ERROR_CODES.OPTIMIZER_ESTIMATE_STALE
    ) {
      await this.stale();
    } else if (
      error instanceof StorageRequestError &&
      error.code === STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY
    ) {
      this.update({ error: messageForCode(error.code) });
    } else {
      this.handleError(error);
    }
  }

  readonly estimate = (): Promise<void> =>
    this.submit('estimate', () => this.options.api.estimate(this.options.fileId));
  readonly run = (): Promise<void> => {
    const status = this.state.optimization;
    if (status?.state !== 'estimada') return Promise.resolve();
    return this.submit('run', () =>
      this.options.api.run(this.options.fileId, { optimizationId: status.id }),
    );
  };

  readonly revalidate = (): void => {
    this.clearTimer();
    this.ticket += 1;
    if (document.visibilityState === 'visible') void this.load();
  };

  start(): void {
    this.options.publish(this.state);
    document.addEventListener('visibilitychange', this.revalidate);
    window.addEventListener('online', this.revalidate);
    void this.load();
  }

  dispose(): void {
    this.alive = false;
    this.ticket += 1;
    this.clearTimer();
    document.removeEventListener('visibilitychange', this.revalidate);
    window.removeEventListener('online', this.revalidate);
  }
}
