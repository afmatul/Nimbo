import { spawn, type ChildProcess } from 'node:child_process';

import { Injectable } from '@nestjs/common';

import {
  CommandLimitExceededError,
  type CommandLimits,
  type CommandResult,
  type ICommandRunner,
} from '../../application/ports/i-command-runner.port';

/**
 * Variables que el proceso hijo hereda: las que necesita para arrancar y crear temporales en Linux, macOS y Windows.
 * Nada más: el `worker` tiene `GEMINI_API_KEY`, `SMTP_PASSWORD` y las URL de la BD, y un programa externo no las ve.
 */
const INHERITED_ENV = ['PATH', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR'] as const;
/** Código cuando el proceso terminó por una señal que no mandamos (p. ej. falta de memoria). */
const SIGNALLED_EXIT_CODE = -1;

function childEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    INHERITED_ENV.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

/** Salida estándar acumulada hasta `maxBytes`; `accept` responde `false` en cuanto se pasa. */
class BoundedOutput {
  private readonly chunks: Buffer[] = [];
  private size = 0;

  constructor(private readonly maxBytes: number) {}

  accept(chunk: Buffer): boolean {
    this.size += chunk.length;
    if (this.size > this.maxBytes) return false;
    this.chunks.push(chunk);
    return true;
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

/** Junta la salida estándar con tope y resuelve al cerrar; un tope pasado o un error de arranque matan y rechazan. */
function collect(child: ChildProcess, limits: CommandLimits): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const output = new BoundedOutput(limits.maxOutputBytes);
    let settled = false;
    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish();
    };
    const fail = (error: Error): void =>
      settle(() => {
        child.kill('SIGKILL');
        reject(error);
      });
    const timer = setTimeout(
      () => fail(new CommandLimitExceededError('timeout')),
      limits.timeoutMs,
    );
    child.stdout?.on('data', (chunk: Buffer) => {
      if (!output.accept(chunk)) fail(new CommandLimitExceededError('output'));
    });
    child.once('error', fail);
    child.once('close', (code: number | null) =>
      settle(() => resolve({ exitCode: code ?? SIGNALLED_EXIT_CODE, stdout: output.toBuffer() })),
    );
  });
}

/**
 * `ICommandRunner` sobre `child_process.spawn` sin shell (D-11): los argumentos no se interpretan, la salida de error
 * se descarta (puede nombrar rutas) y el hijo no hereda el entorno del `worker`.
 */
@Injectable()
export class ChildProcessRunner implements ICommandRunner {
  run(command: string, args: readonly string[], limits: CommandLimits): Promise<CommandResult> {
    const child = spawn(command, [...args], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: childEnv(),
    });
    return collect(child, limits);
  }
}
