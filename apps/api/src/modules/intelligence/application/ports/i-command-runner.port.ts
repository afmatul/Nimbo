/** Topes de una ejecución: nada externo corre sin tiempo límite ni con salida ilimitada (ADR-0033 b). */
export interface CommandLimits {
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

/** Resultado de un proceso que terminó solo: su código de salida y su salida estándar completa. */
export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: Buffer;
}

/** Qué tope se pasó: el proceso se mató y su resultado no vale. */
export type CommandLimit = 'timeout' | 'output';

/** El proceso pasó un tope de `CommandLimits` y se mató. Transitorio para la cola: no dice nada del contenido. */
export class CommandLimitExceededError extends Error {
  constructor(readonly limit: CommandLimit) {
    super(`El proceso externo se detuvo por pasar el tope de ${limit}.`);
    this.name = new.target.name;
  }
}

/**
 * Ejecuta un programa del sistema (Ghostscript para PDF en 019; regla (a) de Art. V.2): sin shell, con los argumentos
 * literales, un entorno mínimo sin secretos y los topes de `limits`. Un código de salida distinto de 0 **no** rechaza:
 * lo interpreta quien llama. Rechaza si el programa no arranca o con `CommandLimitExceededError`. Interno de
 * `intelligence` hasta que 021 sea su segundo consumidor (D-11, DF-80).
 */
export interface ICommandRunner {
  run(command: string, args: readonly string[], limits: CommandLimits): Promise<CommandResult>;
}

export const I_COMMAND_RUNNER = Symbol('ICommandRunner');
