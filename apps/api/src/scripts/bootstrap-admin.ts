import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';
import { enrollInternalAccountRequestSchema } from '@nimbo/contracts';
import { Logger } from 'nestjs-pino';

import { InitialAdminBootstrapper } from '../modules/backoffice';
import type { InitialAdminCommand } from '../modules/identity';
import { apiEnvSchema, CorrelationContext, DomainError, loadDotenvFile, loadEnv } from '../shared';
import type { Env } from '../shared';

import { BootstrapAdminModule } from './bootstrap-admin.module';

/** Opción de la línea de comandos de cada campo; nombra la que falló sin repetir su valor. */
const OPTION_OF: Readonly<Record<keyof InitialAdminCommand, string>> = {
  fullName: '--name',
  email: '--email',
  employeeCode: '--employee-code',
};

/** Mismas reglas que el alta interna por HTTP (011 CA-6, Q-4b), sin el rol: lo fija el comando. */
const initialAdminSchema = enrollInternalAccountRequestSchema.omit({ role: true });

/** Por qué se niega antes de abrir el contexto Nest: solo motivo y nombres de opción, nunca valores. */
type ArgumentsRefusal =
  | { readonly reason: 'unknown_option' }
  | { readonly reason: 'invalid_arguments'; readonly options: string[] };

type Parsed = { ok: true; command: InitialAdminCommand } | { ok: false; refusal: ArgumentsRefusal };

/** Código de sistema en texto (`ECONNREFUSED`, `ERR_…`): mayúsculas y `_`, así no puede llevar un correo ni un nombre. */
const SYSTEM_ERROR_CODE = /^[A-Z][A-Z0-9_]*$/;

const writeLine = (stream: NodeJS.WriteStream, payload: Record<string, unknown>): void => {
  stream.write(`${JSON.stringify(payload)}\n`);
};

/**
 * `parseArgs` estricto lanza ante una opción desconocida o un valor suelto; su mensaje puede repetir lo escrito y no se
 * muestra (`unknown_option`).
 */
const readOptions = (
  argv: readonly string[],
): Record<keyof InitialAdminCommand, unknown> | null => {
  const text = { type: 'string' } as const;
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: { name: text, email: text, 'employee-code': text },
      strict: true,
    });
    return { fullName: values.name, email: values.email, employeeCode: values['employee-code'] };
  } catch {
    return null;
  }
};

const parseCommand = (argv: readonly string[]): Parsed => {
  const raw = readOptions(argv);
  if (raw === null) return { ok: false, refusal: { reason: 'unknown_option' } };
  const result = initialAdminSchema.safeParse(raw);
  if (result.success) return { ok: true, command: result.data };
  const fields = new Set(result.error.issues.map((issue) => issue.path[0]));
  const options = [...fields].map((field) => OPTION_OF[field as keyof InitialAdminCommand]);
  return { ok: false, refusal: { reason: 'invalid_arguments', options } };
};

/** Código de sistema de un error inesperado (p. ej. Postgres o Redis caídos), si lo trae en texto. */
const systemCodeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && SYSTEM_ERROR_CODE.test(code) ? code : undefined;
};

/** Solo códigos y nombres de campo: el mensaje de un error inesperado podría traer el correo (plan §5). */
const refusalOf = (error: unknown): Record<string, unknown> =>
  error instanceof DomainError
    ? { code: error.code, fields: error.fields?.map((issue) => issue.field) }
    : { errorName: error instanceof Error ? error.name : 'unknown', code: systemCodeOf(error) };

/** Contexto Nest sin HTTP: crea el Administrador, registra el resultado y cierra conexiones. */
async function bootstrapAdmin(env: Env, command: InitialAdminCommand): Promise<void> {
  // Sin `abortOnError`, un fallo al arrancar (p. ej. Postgres caído) llega al `catch` de `main` y sale con `1`.
  const app = await NestFactory.createApplicationContext(BootstrapAdminModule.forRoot(env), {
    bufferLogs: true,
    abortOnError: false,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  try {
    const account = await app.get(InitialAdminBootstrapper).bootstrap(command);
    logger.log({ event: 'admin.bootstrap.completed', userId: account.id });
  } catch (error: unknown) {
    logger.warn({ event: 'admin.bootstrap.refused', ...refusalOf(error) });
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

/**
 * `pnpm --filter api admin:bootstrap --name … --email … --employee-code …` (011 CA-7, plan §4). Sale con `0` si creó
 * el primer Administrador y con `1` si se niega (`IDENTITY_ADMIN_ALREADY_EXISTS`, argumentos inválidos u otro error).
 * Nunca imprime el correo, el nombre ni el token: el enlace llega solo por correo.
 */
async function main(argv: readonly string[]): Promise<void> {
  loadDotenvFile();
  const config = loadEnv(apiEnvSchema);
  if (!config.ok) {
    writeLine(process.stderr, { event: 'config.invalid', issues: config.issues });
    process.exitCode = 1;
    return;
  }
  const parsed = parseCommand(argv);
  if (!parsed.ok) {
    writeLine(process.stderr, { event: 'admin.bootstrap.refused', ...parsed.refusal });
    process.exitCode = 1;
    return;
  }
  await bootstrapAdmin(config.env, parsed.command);
}

void CorrelationContext.run({ correlationId: randomUUID() }, () =>
  main(process.argv.slice(2)).catch((error: unknown) => {
    writeLine(process.stderr, { event: 'admin.bootstrap.refused', ...refusalOf(error) });
    process.exitCode = 1;
  }),
);
