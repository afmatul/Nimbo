import { AppDataSource } from '../migrations/data-source.cli';

import { APP_ROLE, appRoleStatements } from './deploya-env';

const writeLine = (stream: NodeJS.WriteStream, payload: Record<string, unknown>): void => {
  stream.write(`${JSON.stringify(payload)}\n`);
};

const requireVariable = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`falta ${name}`);
  return value;
};

/**
 * En Deploya la base administrada trae un solo usuario, el dueño (`deploya`), así que nadie corre el script de
 * inicialización de compose: el entrypoint del `api` llama a esto (`node dist/scripts/ensure-app-role.js`) antes de
 * las migraciones, con la misma conexión que ellas (`DATABASE_MIGRATION_URL`, el dueño). Nunca imprime la URL ni la
 * contraseña.
 */
async function main(): Promise<void> {
  const password = requireVariable('NIMBO_APP_DB_PASSWORD');
  await AppDataSource.initialize();
  try {
    for (const statement of appRoleStatements(password)) {
      await AppDataSource.query(statement);
    }
    writeLine(process.stdout, { event: 'db.app_role_ready', role: APP_ROLE });
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    writeLine(process.stderr, {
      event: 'db.app_role_failed',
      message: message.replace(/\/\/[^@]*@/g, '//***@'),
    });
    process.exitCode = 1;
  });
}
