#!/usr/bin/env node
// Levanta todo el entorno local con un comando: `pnpm start:all` (desarrollo) o `pnpm start:all --prod` (web compilada).
//   1. comprueba `.env` y Docker; 2. `docker compose up -d --wait` (Postgres, Redis, MinIO, Traefik, Mailpit);
//   3. aplica las migraciones; 4. arranca api, worker y web hasta Ctrl+C.
// Opciones: `--prod` compila la web y la sirve con `next start` (mide la velocidad real, no la de `next dev`);
//           `--onlyoffice` suma ONLYOFFICE Docs (solo para editar .docx, spec 016).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const args = new Set(process.argv.slice(2));
const prod = args.has('--prod');
const onlyoffice = args.has('--onlyoffice');

/** Servicios permanentes que tienen que estar sanos antes de aplicar migraciones. */
const WAITED_SERVICES = ['postgres', 'redis', 'minio'];

/** Sin salida `standalone`: es para la imagen de Docker y en Windows exige symlinks (EPERM sin modo desarrollador). */
const WEB_LOCAL_ENV = { NIMBO_WEB_STANDALONE: 'off' };

const say = (message) => process.stdout.write(`\n[nimbo] ${message}\n`);

function fail(message) {
  process.stderr.write(`\n[nimbo] ${message}\n`);
  process.exit(1);
}

/** Corre un comando hasta que termine; si falla, corta todo. */
function step(title, command, commandArgs, env = {}) {
  say(title);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) fail(`Falló: ${command} ${commandArgs.join(' ')}`);
}

if (!existsSync(resolve(ROOT, '.env')))
  fail('Falta `.env`: copia `.env.example` (cp .env.example .env).');
if (spawnSync('docker', ['version'], { stdio: 'ignore', shell: true }).status !== 0) {
  fail('Docker no responde: abre Docker Desktop y vuelve a intentarlo.');
}

const profile = onlyoffice ? ['--profile', 'onlyoffice'] : [];
step('Levantando servicios (Docker)…', 'docker', ['compose', ...profile, 'up', '-d']);
// `--wait` no sirve con todo: `minio-init` es una tarea de un solo uso que termina (código 0) y `--wait` la cuenta como fallo.
step('Esperando a que respondan…', 'docker', ['compose', 'up', '-d', '--wait', ...WAITED_SERVICES]);
step('Aplicando migraciones…', 'pnpm', ['--filter', 'api', 'migration:run']);

const services = prod
  ? [
      ['api', ['--filter', 'api', 'dev']],
      ['worker', ['--filter', 'worker', 'dev']],
    ]
  : [['apps', ['dev']]];

if (prod) step('Compilando la web…', 'pnpm', ['--filter', 'web', 'build'], WEB_LOCAL_ENV);
if (prod) services.push(['web', ['--filter', 'web', 'start']]);

say(
  `Arrancando ${prod ? 'api, worker y web compilada' : 'api, worker y web'}. Web: http://localhost:3002 · Ctrl+C para parar.`,
);
const children = services.map(([, commandArgs]) =>
  spawn('pnpm', commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...(prod ? WEB_LOCAL_ENV : {}) },
  }),
);

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    // En Windows `kill` no alcanza a los procesos nietos: `taskkill /T` cierra el árbol.
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  say('Apps detenidas. Docker sigue arriba (`docker compose down` para pararlo).');
  process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const child of children) child.on('exit', (code) => stop(code ?? 0));
