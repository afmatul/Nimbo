import { AppDataSource } from '../migrations/data-source.cli';

type Command = 'run' | 'revert';

const writeLine = (payload: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

const parseCommand = (argument: string | undefined): Command => {
  if (argument === 'run' || argument === 'revert') {
    return argument;
  }
  throw new Error(`Uso: migrate.ts <run|revert> (recibido: ${argument ?? 'nada'})`);
};

/**
 * Mismo archivo en local (`tsx src/scripts/migrate.ts`) y en la imagen (`node dist/scripts/migrate.js`).
 * Cada migración corre en su propia transacción; cualquier fallo sale con `1` (CA-11, CA-12).
 */
async function main(command: Command): Promise<void> {
  await AppDataSource.initialize();
  try {
    if (command === 'run') {
      const applied = await AppDataSource.runMigrations({ transaction: 'each' });
      writeLine({ event: 'migration.run', applied: applied.map((migration) => migration.name) });
      return;
    }
    const last = await AppDataSource.query<{ name: string }[]>(
      'SELECT name FROM migracion ORDER BY id DESC LIMIT 1',
    );
    await AppDataSource.undoLastMigration({ transaction: 'each' });
    writeLine({ event: 'migration.revert', reverted: last.map((row) => row.name) });
  } finally {
    await AppDataSource.destroy();
  }
}

main(parseCommand(process.argv[2])).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ event: 'migration.failed', message })}\n`);
  process.exitCode = 1;
});
