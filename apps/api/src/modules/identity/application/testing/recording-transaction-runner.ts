import type { ITransactionRunner } from '../../../../shared';

/**
 * `ITransactionRunner` falso que anota `commit` en una línea de tiempo común solo si el trabajo termina; si lanza, no
 * hay commit. Permite comprobar qué ocurre antes y después de confirmar (plan 002 §6.3, «revocar y después lanzar»).
 */
export class RecordingTransactionRunner implements ITransactionRunner {
  constructor(private readonly timeline: string[]) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    const result = await work();
    this.timeline.push('commit');
    return result;
  }
}
