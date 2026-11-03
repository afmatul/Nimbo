import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

const ROOT = resolve(__dirname, '..');
const MIB = 1024 * 1024;
const OBSERVABILITY = ['prometheus', 'grafana', 'cadvisor'] as const;

interface Port {
  readonly host_ip?: string;
  readonly published?: string;
  readonly target: number;
}
interface Volume {
  readonly source?: string;
  readonly target: string;
  readonly read_only?: boolean;
}
interface ComposeService {
  readonly image?: string;
  readonly command?: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
  readonly extra_hosts?: readonly string[];
  readonly labels?: Readonly<Record<string, string>>;
  readonly mem_limit?: number | string;
  readonly ports?: readonly Port[];
  readonly privileged?: boolean;
  readonly volumes?: readonly Volume[];
}
interface ComposeConfig {
  readonly services: Readonly<Record<string, ComposeService>>;
}
interface Fixture {
  readonly project: string;
  readonly env: Readonly<Record<string, string>>;
}

const COMPOSITIONS: [string, string[], string[]][] = [
  ['base', ['compose.yml'], []],
  ['local', ['compose.yml', 'compose.override.yml'], ['apps']],
];
if (existsSync(join(ROOT, 'compose.staging.yml'))) {
  COMPOSITIONS.push(['staging', ['compose.yml', 'compose.staging.yml'], []]);
}

const loadConfig = (fixture: Fixture, files: readonly string[], profiles: readonly string[]) => {
  const args = [
    'compose',
    '--project-directory',
    fixture.project,
    '--env-file',
    join(fixture.project, '.env'),
    ...files.flatMap((file) => ['-f', join(ROOT, file)]),
    ...profiles.flatMap((profile) => ['--profile', profile]),
    'config',
    '--format',
    'json',
  ];
  const result = spawnSync('docker', args, {
    cwd: ROOT,
    env: { ...process.env, ...fixture.env, COMPOSE_FILE: '' },
    encoding: 'utf8',
    timeout: 30_000,
  });
  // No volcar stdout/stderr: la configuración resuelta contiene credenciales, aunque aquí sean de ejemplo.
  if (result.status !== 0)
    throw new Error('Docker Compose no pudo resolver la configuración de observabilidad.');
  return JSON.parse(result.stdout) as ComposeConfig;
};

const serviceOf = (config: ComposeConfig, name: string): ComposeService => {
  const service = config.services[name];
  if (service === undefined) throw new Error(`Falta ${name} en Compose.`);
  return service;
};

const requireEnv = (env: Fixture['env'], key: string): string => {
  const value = env[key];
  if (value === undefined) throw new Error(`Falta ${key} en .env.example.`);
  return value;
};

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

const dashboardExprs = (): string[] => {
  const dashboard = JSON.parse(read('infra/grafana/dashboards/operacion.json')) as {
    panels: { targets?: { expr: string }[] }[];
  };
  return dashboard.panels.flatMap((panel) => (panel.targets ?? []).map((target) => target.expr));
};

const createFixture = (): Fixture => {
  const env = Object.fromEntries(
    Object.entries(parseEnv(read('.env.example'))).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const project = mkdtempSync(join(tmpdir(), 'nimbo-observability-'));
  // `--project-directory` hace que los env_file se resuelvan contra este fixture, nunca el `.env` local.
  writeFileSync(
    join(project, '.env'),
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
  return { project, env };
};

describe('022 T-01: Compose de observabilidad (CA-2, CA-3, CA-9, CA-10)', () => {
  const fixture = createFixture();

  afterAll(() => {
    rmSync(fixture.project, { recursive: true, force: true });
  });

  describe.each(COMPOSITIONS)('%s', (_name, files, profiles) => {
    let config: ComposeConfig;
    beforeAll(() => {
      config = loadConfig(fixture, files, profiles);
    });

    it('CA-2: Prometheus y cAdvisor no publican puertos', () => {
      expect(serviceOf(config, 'prometheus').ports ?? []).toEqual([]);
      expect(serviceOf(config, 'cadvisor').ports ?? []).toEqual([]);
    });

    it('CA-2: Grafana solo se publica en 127.0.0.1 y en GRAFANA_PORT', () => {
      const ports = (serviceOf(config, 'grafana').ports ?? []).map(
        (port) => `${port.host_ip ?? ''}:${port.published ?? ''}:${String(port.target)}`,
      );
      expect(ports).toEqual([`127.0.0.1:${requireEnv(fixture.env, 'GRAFANA_PORT')}:3000`]);
    });

    it('CA-2: ningún puerto de métricas de los procesos se publica', () => {
      const internal = new Set([
        requireEnv(fixture.env, 'METRICS_PORT'),
        requireEnv(fixture.env, 'WORKER_PORT'),
        requireEnv(fixture.env, 'WORKER_OPTIMIZER_PORT'),
      ]);
      const exposed = Object.values(config.services)
        .flatMap((service) => service.ports ?? [])
        .filter(
          (port) => internal.has(String(port.target)) || internal.has(String(port.published)),
        );
      expect(exposed).toEqual([]);
    });

    it('CA-2: ningún servicio de observabilidad tiene etiquetas de Traefik', () => {
      for (const name of OBSERVABILITY) {
        const labels = Object.keys(serviceOf(config, name).labels ?? {}).filter((key) =>
          key.startsWith('traefik.'),
        );
        expect(labels).toEqual([]);
      }
    });

    it('CA-3: cAdvisor no es privilegiado y todos sus montajes son de solo lectura', () => {
      const cadvisor = serviceOf(config, 'cadvisor');
      expect(cadvisor.privileged ?? false).toBe(false);
      const writable = (cadvisor.volumes ?? []).filter((volume) => volume.read_only !== true);
      expect(writable.map((volume) => volume.target)).toEqual([]);
    });

    it('CA-3: cAdvisor solo recolecta CPU, memoria y disco de los contenedores de Docker', () => {
      expect(serviceOf(config, 'cadvisor').command).toEqual(
        expect.arrayContaining([
          '--docker_only=true',
          '--store_container_labels=false',
          '--enable_metrics=cpu,memory,disk',
        ]),
      );
    });

    it('ADR-0040: las imágenes de observabilidad están fijadas a su versión', () => {
      expect(serviceOf(config, 'prometheus').image).toBe('prom/prometheus:v3.15.0');
      expect(serviceOf(config, 'grafana').image).toBe('grafana/grafana:13.2.4');
      expect(serviceOf(config, 'cadvisor').image).toBe('ghcr.io/google/cadvisor:v0.60.6');
    });

    it('ADR-0040: Prometheus conserva 15 días y 1 GB como máximo', () => {
      expect(serviceOf(config, 'prometheus').command).toEqual(
        expect.arrayContaining([
          '--storage.tsdb.retention.time=15d',
          '--storage.tsdb.retention.size=1GB',
        ]),
      );
    });

    it('R-4: los límites de memoria son 256, 256 y 128 MiB', () => {
      expect(Number(serviceOf(config, 'prometheus').mem_limit)).toBe(256 * MIB);
      expect(Number(serviceOf(config, 'grafana').mem_limit)).toBe(256 * MIB);
      expect(Number(serviceOf(config, 'cadvisor').mem_limit)).toBe(128 * MIB);
    });

    it('CA-9: Grafana arranca sin acceso anónimo, sin registro y sin telemetría', () => {
      expect(serviceOf(config, 'grafana').environment).toMatchObject({
        GF_AUTH_ANONYMOUS_ENABLED: 'false',
        GF_USERS_ALLOW_SIGN_UP: 'false',
        GF_ANALYTICS_REPORTING_ENABLED: 'false',
      });
    });

    it('CA-10: Grafana lee la fuente, el tablero y las reglas por archivo, en solo lectura', () => {
      const readOnly = (serviceOf(config, 'grafana').volumes ?? [])
        .filter((volume) => volume.read_only === true)
        .map((volume) => volume.target);
      expect(readOnly).toEqual(
        expect.arrayContaining(['/etc/grafana/provisioning', '/var/lib/grafana/dashboards']),
      );
    });

    it('Prometheus lee su configuración de infra/ y guarda sus datos en un volumen propio', () => {
      const volumes = serviceOf(config, 'prometheus').volumes ?? [];
      expect(
        volumes.some((volume) => volume.source?.endsWith('infra/prometheus/prometheus.yml')),
      ).toBe(true);
      expect(volumes.some((volume) => volume.target === '/prometheus')).toBe(true);
    });
  });

  describe('override local (R3)', () => {
    let config: ComposeConfig;
    beforeAll(() => {
      config = loadConfig(fixture, ['compose.yml', 'compose.override.yml'], ['apps']);
    });

    it('Prometheus resuelve api, worker y worker-optimizer hacia el anfitrión (las apps corren con pnpm dev)', () => {
      expect([...(serviceOf(config, 'prometheus').extra_hosts ?? [])].sort()).toEqual([
        'api=host-gateway',
        'worker-optimizer=host-gateway',
        'worker=host-gateway',
      ]);
    });

    it('Grafana envía el correo de alertas a Mailpit', () => {
      expect(serviceOf(config, 'grafana').environment?.GF_SMTP_HOST).toBe('mailpit:1025');
    });
  });

  describe('aprovisionamiento de Grafana y configuración de Prometheus (CA-10)', () => {
    it('la fuente de datos es Prometheus, con uid fijo y dentro de la red interna', () => {
      const datasource = read('infra/grafana/provisioning/datasources/prometheus.yml');
      expect(datasource).toMatch(/uid: prometheus/);
      expect(datasource).toMatch(/type: prometheus/);
      expect(datasource).toMatch(/url: http:\/\/prometheus:9090/);
    });

    it('el proveedor de tableros no permite cambiarlos desde la interfaz', () => {
      expect(read('infra/grafana/provisioning/dashboards/dashboards.yml')).toMatch(
        /allowUiUpdates: false/,
      );
    });

    it('Prometheus recolecta api, worker, worker-optimizer y cadvisor, con los puertos de .env.example', () => {
      const scrape = read('infra/prometheus/prometheus.yml');
      const jobs = [...scrape.matchAll(/job_name:\s*([\w-]+)/g)].map((match) => match[1]);
      expect(jobs).toEqual(['api', 'worker', 'worker-optimizer', 'cadvisor']);
      expect(scrape).toContain(`worker:${requireEnv(fixture.env, 'WORKER_PORT')}`);
      expect(scrape).toContain(
        `worker-optimizer:${requireEnv(fixture.env, 'WORKER_OPTIMIZER_PORT')}`,
      );
      expect(scrape).toContain(`api:${requireEnv(fixture.env, 'METRICS_PORT')}`);
    });

    it('el tablero de operación muestra CPU y memoria por contenedor', () => {
      const dashboard = JSON.parse(read('infra/grafana/dashboards/operacion.json')) as {
        panels: { targets?: { expr: string }[] }[];
      };
      const exprs = dashboard.panels.flatMap((panel) => (panel.targets ?? []).map((t) => t.expr));
      expect(
        exprs.some(
          (expr) => /container_cpu_usage_seconds_total/.test(expr) && /by \(name\)/.test(expr),
        ),
      ).toBe(true);
      expect(
        exprs.some(
          (expr) => /container_memory_working_set_bytes/.test(expr) && /by \(name\)/.test(expr),
        ),
      ).toBe(true);
    });
  });

  describe('022 T-02: paneles de HTTP y procesos (CA-1, CA-6)', () => {
    it('CA-6: el tablero muestra la tasa de errores 5xx sobre el total de peticiones', () => {
      expect(
        dashboardExprs().some(
          (expr) =>
            /nimbo_http_request_duration_seconds_count/.test(expr) &&
            /status=~"5\.\."/.test(expr) &&
            expr.includes(' / '),
        ),
      ).toBe(true);
    });

    it('CA-6: el tablero muestra la latencia p50, p95 y p99 de las peticiones HTTP', () => {
      const exprs = dashboardExprs();
      for (const quantile of ['0.5', '0.95', '0.99']) {
        expect(
          exprs.some(
            (expr) =>
              expr.includes(`histogram_quantile(${quantile}`) &&
              /nimbo_http_request_duration_seconds_bucket/.test(expr),
          ),
        ).toBe(true);
      }
    });

    it('CA-1: el tablero cuenta las peticiones por plantilla de ruta', () => {
      expect(
        dashboardExprs().some(
          (expr) =>
            /nimbo_http_request_duration_seconds_count/.test(expr) && /by \(route\)/.test(expr),
        ),
      ).toBe(true);
    });

    it('CA-1: el tablero muestra si cada proceso está arriba, por job', () => {
      expect(
        dashboardExprs().some((expr) => /^up\b.*by \(job\)|by \(job\).*\bup\b/.test(expr)),
      ).toBe(true);
    });
  });
});
