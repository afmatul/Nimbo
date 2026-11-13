import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';

import { HeadObjectCommand } from '@aws-sdk/client-s3';
import type { DataSource } from 'typeorm';

import { DEMO_EMAIL_DOMAIN } from '../../../src/seed/demo-corpus';
import { connectAsOwner, requiredEnv } from '../../support/database-urls';
import { compiledEntry } from '../setup/compiled-api';
import { buildTestEnv } from '../setup/test-app';
import { harnessS3 } from '../storage/storage-http';

const API_ROOT = resolve(__dirname, '../../..');
/** El comando compilado por el arnés, como en la imagen (`node dist/scripts/seed.js`). */
const SEED_SCRIPT = resolve(dirname(compiledEntry('main')), 'scripts', 'seed.js');
const DEMO_PASSWORD = 'Cielo-Sereno-demo-2026';
const DEMO_USERS = `%@${DEMO_EMAIL_DOMAIN}`;
const QUOTA_PLAN_SLUG = 'demo-cuota';

interface SeedRun {
  readonly exitCode: number | null;
  readonly output: string;
  readonly events: readonly Record<string, unknown>[];
}

/** Corre la semilla como proceso real con el entorno del arnés (`nimbo_app`, MinIO y Redis de los contenedores). */
const runSeed = (password: string): Promise<SeedRun> =>
  new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [SEED_SCRIPT], {
      cwd: API_ROOT,
      env: { ...process.env, SEED_DEMO_PASSWORD: password },
    });
    let output = '';
    const collect = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', reject);
    child.once('exit', (exitCode) => {
      const events = output
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      resolveRun({ exitCode, output, events });
    });
  });

const createdBy = (run: SeedRun): unknown =>
  run.events.find((line) => line.event === 'seed.completed')?.created;

/** Borra lo sembrado (el dueño del arnés es superusuario, sin RLS): las demás suites comparten la base. */
const removeSeeded = async (owner: DataSource): Promise<void> => {
  const ids = 'SELECT id FROM usuario WHERE correo LIKE $1';
  await owner.query(`DELETE FROM enlace_publico WHERE propietario_id IN (${ids})`, [DEMO_USERS]);
  await owner.query(`DELETE FROM comparticion WHERE propietario_id IN (${ids})`, [DEMO_USERS]);
  await owner.query(`DELETE FROM archivo WHERE propietario_id IN (${ids})`, [DEMO_USERS]);
  await owner.query(`DELETE FROM carpeta WHERE propietario_id IN (${ids})`, [DEMO_USERS]);
  await owner.query('DELETE FROM usuario WHERE correo LIKE $1', [DEMO_USERS]);
  await owner.query('DELETE FROM plan WHERE slug = $1', [QUOTA_PLAN_SLUG]);
};

const scalar = async <T>(owner: DataSource, sql: string, params: unknown[] = []): Promise<T> => {
  const [row] = (await owner.query(sql, params)) as { value: T }[];
  return row?.value as T;
};

const emailOf = (key: string): string => `${key}@${DEMO_EMAIL_DOMAIN}`;

/** Semilla de demostración con casos límite (registro de cambios; `docs/operations/deploya.md`). */
describe('semilla de demostración (`dist/scripts/seed.js`)', () => {
  let owner: DataSource;
  let firstRun: SeedRun;

  beforeAll(async () => {
    owner = await connectAsOwner();
    await removeSeeded(owner);
  });

  afterAll(async () => {
    await removeSeeded(owner);
    await owner.destroy();
  });

  it('se niega con una contraseña que no cumple la política, sin escribir nada ni imprimirla', async () => {
    const weak = 'corta1';

    const run = await runSeed(weak);

    expect(run.exitCode).toBe(1);
    expect(run.output).not.toContain(weak);
    expect(
      await scalar(owner, 'SELECT count(*)::int AS value FROM usuario WHERE correo LIKE $1', [
        DEMO_USERS,
      ]),
    ).toBe(0);
  });

  it('crea las cuentas, el plan de cuota, el árbol, las comparticiones y los enlaces', async () => {
    firstRun = await runSeed(DEMO_PASSWORD);

    expect(firstRun.exitCode).toBe(0);
    expect(createdBy(firstRun)).toEqual({
      plans: 1,
      accounts: 11,
      subscriptions: 7,
      folders: expect.any(Number) as unknown,
      files: 23,
      shares: 5,
      links: 2,
    });
  });

  it('las contraseñas van con Argon2id y la bitácora no lleva la contraseña, correos ni nombres de archivo', async () => {
    const hashes = (await owner.query('SELECT hash_clave FROM usuario WHERE correo LIKE $1', [
      DEMO_USERS,
    ])) as {
      hash_clave: string;
    }[];

    expect(hashes.every(({ hash_clave }) => hash_clave.startsWith('$argon2id$'))).toBe(true);
    for (const secret of [DEMO_PASSWORD, DEMO_EMAIL_DOMAIN, 'Bienvenida.md', 'Respaldo']) {
      expect(firstRun.output).not.toContain(secret);
    }
  });

  it('cuentas internas, sin verificar (sin suscripción) y suspendida', async () => {
    const rows = (await owner.query(
      `SELECT u.correo, u.rol, u.estado, u.correo_verificado, s.id IS NOT NULL AS suscrita
         FROM usuario u LEFT JOIN suscripcion s ON s.usuario_id = u.id WHERE u.correo = ANY($1)`,
      [['admin', 'soporte', 'operador', 'nora', 'pablo'].map(emailOf)],
    )) as {
      correo: string;
      rol: string;
      estado: string;
      correo_verificado: boolean;
      suscrita: boolean;
    }[];
    const byEmail = new Map(rows.map((row) => [row.correo, row]));

    expect(['admin', 'soporte', 'operador'].map((key) => byEmail.get(emailOf(key))?.rol)).toEqual([
      'ADMIN',
      'SUPPORT',
      'OPERATOR',
    ]);
    expect(byEmail.get(emailOf('nora'))).toMatchObject({
      correo_verificado: false,
      suscrita: false,
    });
    expect(byEmail.get(emailOf('pablo'))).toMatchObject({ estado: 'suspendida', suscrita: true });
  });

  it('suscripción vencida en solo lectura y cambio de plan programado', async () => {
    const subscriptionOf = async (key: string) =>
      (
        (await owner.query(
          `SELECT s.estado, s.vence_en < now() AS vencida, p.slug AS pendiente
           FROM suscripcion s JOIN usuario u ON u.id = s.usuario_id LEFT JOIN plan p ON p.id = s.plan_pendiente_id
          WHERE u.correo = $1`,
          [emailOf(key)],
        )) as { estado: string; vencida: boolean; pendiente: string | null }[]
      )[0];

    expect(await subscriptionOf('marta')).toEqual({
      estado: 'solo_lectura',
      vencida: true,
      pendiente: null,
    });
    expect(await subscriptionOf('sofia')).toEqual({
      estado: 'vigente',
      vencida: false,
      pendiente: 'pro',
    });
  });

  it('cuota llena y casi llena: el espacio usado coincide con los archivos y con la cuota del plan', async () => {
    const usageOf = (key: string) =>
      owner.query(
        `SELECT u.espacio_usado::text AS usado, p.cuota_bytes::text AS cuota,
                (SELECT sum(a.tamano_bytes)::text FROM archivo a WHERE a.propietario_id = u.id) AS archivos
           FROM usuario u JOIN suscripcion s ON s.usuario_id = u.id JOIN plan p ON p.id = s.plan_id
          WHERE u.correo = $1`,
        [emailOf(key)],
      ) as Promise<{ usado: string; cuota: string; archivos: string }[]>;

    const [[full], [almost]] = await Promise.all([usageOf('diego'), usageOf('carla')]);

    expect(full).toEqual({ usado: '5000000', cuota: '5000000', archivos: '5000000' });
    expect(almost).toEqual({ usado: '4500000', cuota: '5000000', archivos: '4500000' });
  });

  it('carpetas al máximo de profundidad y nombre de 255 caracteres con unicode', async () => {
    const depth = await scalar<number>(
      owner,
      `SELECT max(c.profundidad)::int AS value FROM carpeta c JOIN usuario u ON u.id = c.propietario_id
        WHERE u.correo = $1`,
      [emailOf('ana')],
    );
    const longest = await scalar<number>(
      owner,
      `SELECT max(char_length(a.nombre))::int AS value FROM archivo a JOIN usuario u ON u.id = a.propietario_id
        WHERE u.correo = $1`,
      [emailOf('ana')],
    );

    expect(depth).toBe(buildTestEnv().FOLDER_MAX_DEPTH);
    expect(longest).toBe(255);
  });

  it('un enlace público activo y uno vencido', async () => {
    const links = (await owner.query(
      `SELECT e.vence_en > now() AS activo FROM enlace_publico e JOIN usuario u ON u.id = e.propietario_id
        WHERE u.correo = $1 ORDER BY 1`,
      [emailOf('ana')],
    )) as { activo: boolean }[];

    expect(links).toEqual([{ activo: false }, { activo: true }]);
  });

  it('cada versión tiene su objeto en MinIO con el tamaño registrado', async () => {
    const versions = (await owner.query(
      `SELECT v.clave_objeto, v.tamano_bytes::text AS tamano FROM version_archivo v
         JOIN archivo a ON a.id = v.archivo_id JOIN usuario u ON u.id = a.propietario_id WHERE u.correo = $1`,
      [emailOf('diego')],
    )) as { clave_objeto: string; tamano: string }[];
    const s3 = harnessS3();

    const sizes = await Promise.all(
      versions.map(async ({ clave_objeto }) => {
        const head = await s3.send(
          new HeadObjectCommand({ Bucket: requiredEnv('MINIO_BUCKET'), Key: clave_objeto }),
        );
        return String(head.ContentLength);
      }),
    );
    s3.destroy();

    expect(sizes.sort()).toEqual(versions.map(({ tamano }) => tamano).sort());
  });

  it('es idempotente: la segunda corrida no crea nada ni cambia el espacio usado', async () => {
    const before = await scalar<string>(
      owner,
      'SELECT sum(espacio_usado)::text AS value FROM usuario WHERE correo LIKE $1',
      [DEMO_USERS],
    );

    const second = await runSeed(DEMO_PASSWORD);

    expect(second.exitCode).toBe(0);
    expect(createdBy(second)).toEqual({
      plans: 0,
      accounts: 0,
      subscriptions: 0,
      folders: 0,
      files: 0,
      shares: 0,
      links: 0,
    });
    expect(
      await scalar<string>(
        owner,
        'SELECT sum(espacio_usado)::text AS value FROM usuario WHERE correo LIKE $1',
        [DEMO_USERS],
      ),
    ).toBe(before);
  });
});
