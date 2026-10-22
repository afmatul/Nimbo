import { CommandLimitExceededError } from '../../application/ports/i-command-runner.port';

import { ChildProcessRunner } from './child-process.runner';

const NODE = process.execPath;
const LIMITS = { timeoutMs: 10_000, maxOutputBytes: 64 * 1024 };
const runner = new ChildProcessRunner();

/** Corre un guion de Node con `args` como argumentos propios (`process.argv.slice(1)` dentro del hijo). */
const runScript = (script: string, args: readonly string[] = [], limits = LIMITS) =>
  runner.run(NODE, ['-e', script, ...args], limits);

describe('ChildProcessRunner', () => {
  it('devuelve el código de salida y la salida estándar del proceso', async () => {
    const result = await runScript('process.stdout.write("hola"); process.exit(3)');

    expect(result.exitCode).toBe(3);
    expect(result.stdout.toString('utf8')).toBe('hola');
  });

  it('sin shell: los argumentos llegan literales, sin expandir variables, tuberías ni sustituciones', async () => {
    const hostile = ['$(whoami); echo pwned', '%PATH%', 'a | b & c > d', '`id`'];

    const result = await runScript(
      'process.stdout.write(JSON.stringify(process.argv.slice(1)))',
      hostile,
    );

    expect(JSON.parse(result.stdout.toString('utf8'))).toEqual(hostile);
  });

  it('no hereda secretos del entorno del worker (p. ej. `GEMINI_API_KEY`)', async () => {
    process.env.GEMINI_API_KEY = 'clave-que-no-debe-salir';
    try {
      const result = await runScript('process.stdout.write(String(process.env.GEMINI_API_KEY))');

      expect(result.stdout.toString('utf8')).toBe('undefined');
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it('tiempo límite: mata el proceso y rechaza con `timeout`', async () => {
    const started = Date.now();

    await expect(
      runScript('setTimeout(() => {}, 30000)', [], { ...LIMITS, timeoutMs: 200 }),
    ).rejects.toMatchObject({ name: CommandLimitExceededError.name, limit: 'timeout' });
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('salida acotada: pasar el tope mata el proceso y rechaza con `output`', async () => {
    const script = 'process.stdout.write("x".repeat(100000)); setTimeout(() => {}, 30000)';

    await expect(runScript(script, [], { ...LIMITS, maxOutputBytes: 1024 })).rejects.toMatchObject({
      name: CommandLimitExceededError.name,
      limit: 'output',
    });
  });

  it('un binario inexistente rechaza (error transitorio para la cola)', async () => {
    await expect(runner.run('nimbo-binario-que-no-existe', [], LIMITS)).rejects.toThrow();
  });
});
