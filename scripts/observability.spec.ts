import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

const ROOT = resolve(__dirname, '..');
const MIB = 1024 * 1024;
const OBSERVABILITY = ['prometheus', 'grafana', 'cadvisor'] as const;
/** Donde Grafana lee los tableros: destino del montaje y `path` del proveedor (CA-10). */
const DASHBOARDS_PATH = '/var/lib/grafana/dashboards';

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

interface DashboardPanel {
  readonly id: number;
  readonly type: string;
  readonly title: string;
  readonly description?: string;
  readonly targets?: readonly { expr: string; legendFormat?: string }[];
}

const dashboardPanels = (): DashboardPanel[] =>
  (JSON.parse(read('infra/grafana/dashboards/operacion.json')) as { panels: DashboardPanel[] })
    .panels;

/** Etiquetas cerradas que pueden usar los grupos de los módulos (022d CA-12). */
const MODULE_LABELS = new Set(['job', 'route', 'status', 'queue', 'state', 'attempts_made', 'le']);
const API_PREFIX = '/api/v1';
const CONTROLLERS_ROOT = 'apps/api/src/modules';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Paneles de un grupo: los que siguen a la fila con ese título hasta la fila siguiente (022d plan §2). */
const groupPanels = (title: string): DashboardPanel[] => {
  const panels = dashboardPanels();
  const start = panels.findIndex((panel) => panel.type === 'row' && panel.title === title);
  if (start === -1) return [];
  const rest = panels.slice(start + 1);
  const end = rest.findIndex((panel) => panel.type === 'row');
  return end === -1 ? rest : rest.slice(0, end);
};

/** Paneles de los grupos de los módulos: desde la primera fila hasta el final (los 1 a 15 de 022 no tienen filas). */
const modulePanels = (): DashboardPanel[] => {
  const panels = dashboardPanels();
  const firstRow = panels.findIndex((panel) => panel.type === 'row');
  return firstRow === -1 ? [] : panels.slice(firstRow);
};

const groupExprs = (title: string): string[] =>
  groupPanels(title).flatMap((panel) => (panel.targets ?? []).map((target) => target.expr));

/** Etiquetas de los selectores, de las agrupaciones y de la leyenda de una consulta. */
const labelsOf = (expr: string, legend = ''): string[] => [
  ...[...expr.matchAll(/(\w+)\s*(?:=~|!~|!=|=)\s*"/g)].map((match) => match[1] ?? ''),
  ...[...expr.matchAll(/\b(?:by|without|on|ignoring)\s*\(([^)]*)\)/g)].flatMap((match) =>
    (match[1] ?? '').split(',').map((label) => label.trim()),
  ),
  ...[...legend.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1] ?? ''),
];

/** Plantillas de ruta citadas por `route="…"` o `route=~"a|b"` en una consulta. */
const routesOf = (expr: string): string[] =>
  [...expr.matchAll(/\broute\s*(?:=~|!~|!=|=)\s*"([^"]*)"/g)].flatMap((match) =>
    (match[1] ?? '').split('|'),
  );

/** `MÉTODO /api/v1/<controlador>/<ruta>` sin barra final, como las arma Nest (022d R-3). */
const routeTemplate = (method: string, prefix: string, path: string): string => {
  const joined = [API_PREFIX, prefix, path].filter((part) => part !== '').join('/');
  return `${method.toUpperCase()} ${joined.replace(/\/+/g, '/').replace(/\/$/, '')}`;
};

/** Rutas que declaran los controladores del `api` con decoradores de cadena literal (022d R-2). */
const declaredRoutes = (): Set<string> => {
  const files = readdirSync(join(ROOT, CONTROLLERS_ROOT), { recursive: true, encoding: 'utf8' })
    .filter((file) => /(^|[\\/])presentation[\\/][^\\/]+\.controller\.ts$/.test(file))
    .map((file) => read(join(CONTROLLERS_ROOT, file)));
  const routes = new Set<string>();
  for (const source of files) {
    let prefix = '';
    for (const match of source.matchAll(
      /@(Controller|Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)/g,
    )) {
      const [, decorator = '', path = ''] = match;
      if (decorator === 'Controller') prefix = path;
      else routes.add(routeTemplate(decorator, prefix, path));
    }
  }
  return routes;
};

interface AlertQuery {
  readonly refId: string;
  readonly datasourceUid: string;
  readonly model: {
    readonly expr?: string;
    readonly type?: string;
    readonly expression?: string;
    readonly conditions?: readonly { evaluator: { type: string; params: number[] } }[];
  };
}
interface AlertRule {
  readonly uid: string;
  readonly title: string;
  readonly condition: string;
  readonly for: string;
  readonly noDataState: string;
  readonly execErrState: string;
  readonly data: readonly AlertQuery[];
  readonly annotations?: Readonly<Record<string, string>>;
  readonly labels?: Readonly<Record<string, string>>;
}
interface AlertProvisioning {
  readonly apiVersion: number;
  readonly groups: readonly {
    name: string;
    folder: string;
    interval: string;
    rules: AlertRule[];
  }[];
  readonly contactPoints: readonly {
    name: string;
    receivers: readonly { type: string; settings: Readonly<Record<string, string>> }[];
  }[];
  readonly policies: readonly { receiver: string }[];
}

/** Las seis reglas de `product-context.md` §7 (RN-1), por su `uid` estable. */
const SIX_RULES = [
  'nimbo-5xx',
  'nimbo-latencia-p95',
  'nimbo-colas',
  'nimbo-disco',
  'nimbo-dependencia-caida',
  'nimbo-renovacion',
] as const;
/** Únicas etiquetas que una anotación puede usar (plan §2, CA-5). */
const ANNOTATION_LABELS = new Set(['queue', 'dependency']);

const alerting = (): AlertProvisioning =>
  JSON.parse(read('infra/grafana/provisioning/alerting/alertas.json')) as AlertProvisioning;

const rules = (): AlertRule[] => alerting().groups.flatMap((group) => group.rules);

const ruleOf = (uid: string): AlertRule => {
  const rule = rules().find((candidate) => candidate.uid === uid);
  if (rule === undefined) throw new Error(`Falta la regla ${uid} en alertas.json.`);
  return rule;
};

const queryOf = (rule: AlertRule): string => {
  const expr = rule.data.find((query) => query.datasourceUid === 'prometheus')?.model.expr;
  if (expr === undefined) throw new Error(`La regla ${rule.uid} no consulta Prometheus.`);
  return expr;
};

const thresholdOf = (rule: AlertRule): { type: string; value: number | undefined } => {
  const condition = rule.data.find((query) => query.refId === rule.condition);
  const evaluator = condition?.model.conditions?.[0]?.evaluator;
  return { type: evaluator?.type ?? '', value: evaluator?.params[0] };
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

    it('CA-9: ningún tablero se publica sin cuenta y el Viewer no edita ni explora (P-6)', () => {
      expect(serviceOf(config, 'grafana').environment).toMatchObject({
        GF_PUBLIC_DASHBOARDS_ENABLED: 'false',
        GF_SNAPSHOTS_EXTERNAL_ENABLED: 'false',
        GF_USERS_VIEWERS_CAN_EDIT: 'false',
      });
    });

    it('H-6: los enlaces de los correos de alerta apuntan a Grafana, no al api', () => {
      expect(serviceOf(config, 'grafana').environment?.GF_SERVER_ROOT_URL).toMatch(
        /^http:\/\/localhost:\d+\/$/,
      );
      expect(serviceOf(config, 'grafana').environment?.GF_SERVER_ROOT_URL).not.toBe(
        'http://localhost:3000/',
      );
    });

    it('CA-10: Grafana monta el aprovisionamiento y los tableros desde infra/grafana', () => {
      const sources = Object.fromEntries(
        (serviceOf(config, 'grafana').volumes ?? []).map((volume) => [
          volume.target,
          volume.source ?? '',
        ]),
      );
      expect(sources['/etc/grafana/provisioning']).toMatch(/infra\/grafana\/provisioning$/);
      expect(sources[DASHBOARDS_PATH]).toMatch(/infra\/grafana\/dashboards$/);
    });

    it('CA-10: Grafana lee la fuente, el tablero y las reglas por archivo, en solo lectura', () => {
      const readOnly = (serviceOf(config, 'grafana').volumes ?? [])
        .filter((volume) => volume.read_only === true)
        .map((volume) => volume.target);
      expect(readOnly).toEqual(
        expect.arrayContaining(['/etc/grafana/provisioning', DASHBOARDS_PATH]),
      );
    });

    it('CA-11: Grafana recibe el destinatario de las alertas de ALERT_EMAIL_TO', () => {
      expect(serviceOf(config, 'grafana').environment?.ALERT_EMAIL_TO).toBe(
        requireEnv(fixture.env, 'ALERT_EMAIL_TO'),
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

    it('CA-6 y H-4: sin respuestas 5xx la tasa de errores muestra 0 y no «No data»', () => {
      expect(
        dashboardExprs().some(
          (expr) => /status=~"5\.\."/.test(expr) && expr.includes('or vector(0)) / '),
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

  describe('022 T-03: reglas de alerta, punto de contacto y política (CA-11, CA-12, RN-1, CA-5)', () => {
    it('RN-1: un solo grupo evaluado cada minuto, con reglas solo de las seis definidas', () => {
      const { groups, apiVersion } = alerting();
      expect(apiVersion).toBe(1);
      expect(groups.map((group) => group.interval)).toEqual(['1m']);
      const uids = rules().map((rule) => rule.uid);
      expect(new Set(uids).size).toBe(uids.length);
      expect(uids.every((uid) => (SIX_RULES as readonly string[]).includes(uid))).toBe(true);
    });

    it('RN-1: sin datos no avisa (sin séptima alerta) y un error de evaluación queda como error', () => {
      for (const rule of rules()) {
        expect([rule.uid, rule.noDataState, rule.execErrState]).toEqual([rule.uid, 'OK', 'Error']);
      }
    });

    it('CA-11: la regla de 5xx dispara con más del 2 % de respuestas 5xx del api sostenido 5 min', () => {
      const rule = ruleOf('nimbo-5xx');
      expect(rule.for).toBe('5m');
      expect(thresholdOf(rule)).toEqual({ type: 'gt', value: 0.02 });
      const expr = queryOf(rule);
      expect(expr).toContain('status=~"5.."');
      expect(expr).toContain('job="api"');
      expect(expr).toContain('[1m]');
    });

    it('CA-12: la regla de latencia mide el p95 del api, > 300 ms por 10 min, sin las rutas de RNF-01 (S-5)', () => {
      const rule = ruleOf('nimbo-latencia-p95');
      expect(rule.for).toBe('10m');
      expect(thresholdOf(rule)).toEqual({ type: 'gt', value: 0.3 });
      const expr = queryOf(rule);
      expect(expr).toContain('histogram_quantile(0.95');
      expect(expr).toContain('job="api"');
      expect(expr).toContain('route!~"POST /api/v1/agent/ask|GET /api/v1/editing/content/:token"');
    });

    it('CA-5: títulos, etiquetas y anotaciones solo usan las etiquetas queue y dependency', () => {
      for (const rule of rules()) {
        const texts = [
          rule.title,
          ...Object.values(rule.annotations ?? {}),
          ...Object.values(rule.labels ?? {}),
        ];
        const used = texts.flatMap((text) =>
          [...text.matchAll(/\.Labels\.(\w+)|\$labels\.(\w+)|index \.Labels "(\w+)"/g)].map(
            (match) => match[1] ?? match[2] ?? match[3] ?? '',
          ),
        );
        expect(used.filter((label) => !ANNOTATION_LABELS.has(label))).toEqual([]);
        expect(texts.join(' ')).not.toMatch(/\$labels|\{\{\s*\.Labels\s*\}\}/);
      }
    });

    it('CA-11: el punto de contacto es el correo de ALERT_EMAIL_TO y la política le envía todas las alertas', () => {
      const { contactPoints, policies } = alerting();
      expect(contactPoints).toHaveLength(1);
      const [contact] = contactPoints;
      expect(contact?.receivers.map((receiver) => receiver.type)).toEqual(['email']);
      expect(contact?.receivers[0]?.settings.addresses).toBe('$ALERT_EMAIL_TO');
      expect(policies.map((policy) => policy.receiver)).toEqual([contact?.name]);
    });
  });

  describe('022 T-06: disponibilidad de dependencias y regla de caída (CA-3, CA-6, CA-15)', () => {
    it('CA-15: la regla de caída dispara si una dependencia queda en 0 por 1 min (S-3), una alerta por dependencia', () => {
      const rule = ruleOf('nimbo-dependencia-caida');
      expect(rule.for).toBe('1m');
      expect(thresholdOf(rule)).toEqual({ type: 'lt', value: 1 });
      expect(queryOf(rule)).toBe('min by (dependency) (nimbo_dependency_up)');
    });

    it('CA-15 y CA-5: la anotación nombra la dependencia solo con {{ .Labels.dependency }}', () => {
      const summary = ruleOf('nimbo-dependencia-caida').annotations?.summary ?? '';
      expect(summary).toContain('{{ .Labels.dependency }}');
      expect(summary).not.toContain('$');
    });

    it('CA-6 y CA-3: el tablero muestra la disponibilidad de cada dependencia', () => {
      expect(
        dashboardExprs().some(
          (expr) => /nimbo_dependency_up/.test(expr) && /by \(dependency\)/.test(expr),
        ),
      ).toBe(true);
    });
  });

  describe('022 T-07: disco del anfitrión y las seis reglas (CA-3, CA-14, RN-1)', () => {
    const BLOCK_DEVICES = 'id="/",device=~"/dev/.+",device!~"/dev/(loop|shm).*"';

    it('CA-14: la regla de disco toma el máximo de los dispositivos de bloque del anfitrión, > 80 % por 1 min (S-3, PD-170)', () => {
      const rule = ruleOf('nimbo-disco');
      expect(rule.for).toBe('1m');
      expect(thresholdOf(rule)).toEqual({ type: 'gt', value: 0.8 });
      const expr = queryOf(rule);
      expect(expr).toMatch(/^max\(/);
      expect(expr).toContain(`container_fs_usage_bytes{${BLOCK_DEVICES}}`);
      expect(expr).toContain(`container_fs_limit_bytes{${BLOCK_DEVICES}}`);
    });

    it('CA-14 y H-1: la regla de disco solo mira el dispositivo de bloque de mayor capacidad', () => {
      expect(queryOf(ruleOf('nimbo-disco'))).toContain(
        `and on (device) topk(1, container_fs_limit_bytes{${BLOCK_DEVICES}})`,
      );
    });

    it('CA-3: el tablero muestra el uso de los discos del anfitrión por dispositivo', () => {
      expect(
        dashboardExprs().some(
          (expr) =>
            expr.includes(`container_fs_usage_bytes{${BLOCK_DEVICES}}`) &&
            expr.includes(`container_fs_limit_bytes{${BLOCK_DEVICES}}`) &&
            /by \(device\)/.test(expr),
        ),
      ).toBe(true);
    });

    it('CA-3: el tablero muestra el disco usado por cada contenedor, por nombre', () => {
      expect(dashboardExprs()).toContain('sum by (name) (container_fs_usage_bytes{name!=""})');
    });

    it('RN-1: alertas.json tiene exactamente las seis reglas de product-context.md §7', () => {
      expect(
        rules()
          .map((rule) => rule.uid)
          .sort(),
      ).toEqual([...SIX_RULES].sort());
    });
  });

  describe('022 T-04: paneles y regla de colas (CA-1, CA-6, CA-13)', () => {
    it('CA-6: el tablero muestra la profundidad de cada cola por estado', () => {
      expect(
        dashboardExprs().some(
          (expr) => /nimbo_queue_jobs\b/.test(expr) && /by \(queue, state\)/.test(expr),
        ),
      ).toBe(true);
    });

    it('CA-1: el tablero muestra la espera y la ejecución de los trabajos por cola', () => {
      for (const series of ['nimbo_queue_job_wait_seconds', 'nimbo_queue_job_run_seconds']) {
        expect(
          dashboardExprs().some(
            (expr) =>
              expr.includes(`${series}_bucket`) &&
              expr.includes('histogram_quantile(0.95') &&
              /by \(queue, le\)/.test(expr),
          ),
        ).toBe(true);
      }
    });

    it('CA-1: el tablero muestra los completados por cola y los fallidos por cola e intentos', () => {
      const exprs = dashboardExprs();
      expect(
        exprs.some(
          (expr) => expr.includes('nimbo_queue_jobs_completed_total') && /by \(queue\)/.test(expr),
        ),
      ).toBe(true);
      expect(
        exprs.some(
          (expr) =>
            expr.includes('nimbo_queue_job_failures_total') &&
            /by \(queue, attempts_made\)/.test(expr),
        ),
      ).toBe(true);
    });

    it('CA-13: la regla de colas dispara por cola con más de 50 pendientes o un tercer intento fallido en 5 min, sostenido 1 min (S-1, S-2, S-3)', () => {
      const rule = ruleOf('nimbo-colas');
      expect(rule.for).toBe('1m');
      expect(thresholdOf(rule)).toEqual({ type: 'gt', value: 0 });
      const expr = queryOf(rule);
      expect(expr).toContain('nimbo_queue_jobs{state=~"waiting|prioritized"}');
      expect(expr).toContain('> bool 50');
      expect(expr).toContain(
        'increase(nimbo_queue_job_failures_total{attempts_made="3+"}[5m])) > bool 0',
      );
      expect(expr).toMatch(/^max by \(queue\)/);
    });

    it('CA-5: la anotación de la regla de colas nombra la cola y nada más', () => {
      expect(ruleOf('nimbo-colas').annotations?.summary).toContain('{{ .Labels.queue }}');
    });
  });

  describe('022 T-05: regla y panel de la renovación (CA-16)', () => {
    it('CA-16: la regla de renovación dispara con cualquier fallo de subscription-renewal en 15 min, sin esperar (S-4)', () => {
      const rule = ruleOf('nimbo-renovacion');
      expect(rule.for).toBe('0s');
      expect(thresholdOf(rule)).toEqual({ type: 'gt', value: 0 });
      expect(queryOf(rule)).toBe(
        'sum(increase(nimbo_queue_job_failures_total{queue="subscription-renewal"}[15m]))',
      );
    });

    it('CA-16: la consulta de la regla abarca su ventana de 15 min', () => {
      const query = ruleOf('nimbo-renovacion').data.find(
        (candidate) => candidate.datasourceUid === 'prometheus',
      ) as AlertQuery & { relativeTimeRange?: { from: number } };
      expect(query.relativeTimeRange?.from).toBeGreaterThanOrEqual(15 * 60);
    });

    it('CA-16: el tablero muestra los fallos de la renovación', () => {
      expect(dashboardExprs()).toContain(
        'sum(increase(nimbo_queue_job_failures_total{queue="subscription-renewal"}[15m]))',
      );
    });
  });
  describe('022 T-08: tablero aprovisionado y runbook (CA-9, CA-10)', () => {
    it('CA-10: el proveedor carga los tableros del montaje y no permite borrarlos desde la interfaz', () => {
      const provider = read('infra/grafana/provisioning/dashboards/dashboards.yml');
      expect(provider).toContain(`path: ${DASHBOARDS_PATH}`);
      expect(provider).toMatch(/disableDeletion: true/);
    });

    it('CA-9: la fuente de datos aprovisionada no se edita desde la interfaz', () => {
      expect(read('infra/grafana/provisioning/datasources/prometheus.yml')).toMatch(
        /editable: false/,
      );
    });

    it('CA-10: el tablero «Operación» tiene uid fijo, no es editable y sus paneles van en orden de id', () => {
      const dashboard = JSON.parse(read('infra/grafana/dashboards/operacion.json')) as {
        uid: string;
        title: string;
        editable: boolean;
        panels: { id: number }[];
      };
      expect([dashboard.uid, dashboard.title, dashboard.editable]).toEqual([
        'nimbo-operacion',
        'Operación',
        false,
      ]);
      const ids = dashboard.panels.map((panel) => panel.id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('CA-9 y CA-18: el runbook explica el tablero, las seis alertas y el alta de cuentas', () => {
      const runbook = read('docs/operations/observabilidad.md');
      expect(runbook).toContain('nimbo-operacion');
      for (const rule of rules()) expect(runbook).toContain(rule.title);
      expect(runbook).toMatch(/Viewer/);
      expect(runbook).toMatch(/Editor/);
      expect(runbook).toContain('Mailpit');
    });
  });
});

describe('022d: grupos de los módulos en el tablero de operación', () => {
  const HTTP_COUNT = 'nimbo_http_request_duration_seconds_count';

  /** Primera consulta del grupo que cumple todas las condiciones, o `undefined`. */
  const findExpr = (group: string, ...parts: readonly (string | RegExp)[]): string | undefined =>
    groupExprs(group).find((expr) =>
      parts.every((part) => (typeof part === 'string' ? expr.includes(part) : part.test(expr))),
    );

  const sortedRoutes = (expr: string | undefined): string[] => routesOf(expr ?? '').sort();

  describe('T-01: ayudantes y grupo «Identidad» (CA-1, CA-12)', () => {
    it('CA-1: la fila «Identidad» tiene las respuestas de sus diez rutas por ruta y código', () => {
      const expr = findExpr('Identidad', HTTP_COUNT, 'job="api"', 'by (route, status)');
      expect(sortedRoutes(expr)).toEqual(
        [
          'POST /api/v1/auth/register',
          'POST /api/v1/auth/resend-verification',
          'POST /api/v1/auth/verify-email',
          'POST /api/v1/auth/login',
          'POST /api/v1/auth/session/refresh',
          'POST /api/v1/auth/session/logout',
          'POST /api/v1/auth/forgot-password',
          'POST /api/v1/auth/reset-password',
          'POST /api/v1/auth/change-password',
          'POST /api/v1/sessions/revoke-others',
        ].sort(),
      );
    });

    it('CA-1: los inicios de sesión se separan por código (2xx, 401 y 429)', () => {
      const expr = findExpr('Identidad', HTTP_COUNT, /by \(status\)/);
      expect(routesOf(expr ?? '')).toEqual(['POST /api/v1/auth/login']);
    });

    it('CA-1: las denegaciones (403) de todo el api se ven por ruta', () => {
      const expr = findExpr('Identidad', HTTP_COUNT, 'status="403"', 'by (route)');
      expect(expr).toBeDefined();
      expect(routesOf(expr ?? '')).toEqual([]);
    });

    it('CA-12: los grupos de los módulos solo usan las etiquetas job, route, status, queue, state, attempts_made y le', () => {
      const targets = modulePanels().flatMap((panel) => panel.targets ?? []);
      expect(targets.length).toBeGreaterThan(0);
      const used = targets.flatMap((target) => labelsOf(target.expr, target.legendFormat));
      expect(used.filter((label) => !MODULE_LABELS.has(label))).toEqual([]);
    });

    it('CA-12: cada ruta citada existe como plantilla en un controlador del api', () => {
      const declared = declaredRoutes();
      const cited = dashboardPanels().flatMap((panel) =>
        (panel.targets ?? []).flatMap((target) => routesOf(target.expr)),
      );
      expect(cited.length).toBeGreaterThan(0);
      expect(cited.filter((route) => !declared.has(route))).toEqual([]);
    });

    it('CA-12: ningún panel de los grupos contiene correos, UUID ni identificadores', () => {
      const texts = modulePanels().flatMap((panel) => [
        panel.title,
        panel.description ?? '',
        ...(panel.targets ?? []).flatMap((target) => [target.expr, target.legendFormat ?? '']),
      ]);
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.filter((text) => UUID.test(text) || text.includes('@'))).toEqual([]);
    });

    it('R-2: el lector de controladores entiende la ruta sin barra final y las plantillas con parámetros', () => {
      const declared = declaredRoutes();
      expect(declared.has('POST /api/v1/uploads')).toBe(true);
      expect(declared.has('POST /api/v1/files/:fileId/versions/:versionId/download-url')).toBe(
        true,
      );
      expect(declared.has('POST /api/v1/agent/ask')).toBe(true);
    });
  });

  describe('T-02: grupo «Almacenamiento» (CA-2)', () => {
    const UPLOADS = [
      'POST /api/v1/uploads',
      'POST /api/v1/uploads/:uploadId/resume',
      'POST /api/v1/uploads/:uploadId/complete',
    ];
    const DOWNLOADS = [
      'POST /api/v1/files/:fileId/download-url',
      'POST /api/v1/files/:fileId/versions/:versionId/download-url',
    ];

    it('CA-2: la fila «Almacenamiento» muestra las cargas iniciadas, reanudadas y completadas por ruta y código', () => {
      const expr = findExpr('Almacenamiento', HTTP_COUNT, 'job="api"', 'by (route, status)');
      expect(sortedRoutes(expr)).toEqual([...UPLOADS].sort());
    });

    it('CA-2: los enlaces de descarga emitidos (2xx) de archivos y versiones se ven por ruta', () => {
      const expr = findExpr('Almacenamiento', HTTP_COUNT, 'status=~"2.."', 'by (route)');
      expect(sortedRoutes(expr)).toEqual([...DOWNLOADS].sort());
    });

    it('CA-2: los límites de frecuencia (429) de cargas y descargas se ven por ruta', () => {
      const expr = findExpr('Almacenamiento', HTTP_COUNT, 'status="429"', 'by (route)');
      expect(sortedRoutes(expr)).toEqual([...UPLOADS, ...DOWNLOADS].sort());
    });
  });

  describe('T-03: grupos «Indexación» y «Optimizador» (CA-7, CA-8)', () => {
    const INDEXING = 'queue=~"indexing|index-reconcile"';
    const OPTIMIZATION = 'queue="optimization"';

    /** Completados por cola, fallidos por intento y ejecución p95 de las colas de un grupo. */
    const expectQueueSignals = (group: string, queues: string): void => {
      expect(
        findExpr(group, `nimbo_queue_jobs_completed_total{${queues}}`, 'by (queue)'),
      ).toBeDefined();
      expect(
        findExpr(group, `nimbo_queue_job_failures_total{${queues}}`, 'by (queue, attempts_made)'),
      ).toBeDefined();
      expect(
        findExpr(
          group,
          'histogram_quantile(0.95',
          `nimbo_queue_job_run_seconds_bucket{${queues}}`,
          'by (queue, le)',
        ),
      ).toBeDefined();
    };

    it('CA-7: la fila «Indexación» muestra completados, fallidos por intento y ejecución p95 de indexing e index-reconcile', () => {
      expectQueueSignals('Indexación', INDEXING);
    });

    it('CA-7: la fila «Indexación» muestra la profundidad de sus colas por estado', () => {
      expect(
        findExpr('Indexación', `nimbo_queue_jobs{${INDEXING}}`, 'by (queue, state)'),
      ).toBeDefined();
    });

    it('CA-8: la fila «Optimizador» muestra las solicitudes de estimar y optimizar por código', () => {
      const expr = findExpr('Optimizador', HTTP_COUNT, 'job="api"', 'by (route, status)');
      expect(sortedRoutes(expr)).toEqual([
        'POST /api/v1/files/:fileId/optimization/estimate',
        'POST /api/v1/files/:fileId/optimization/run',
      ]);
    });

    it('CA-8: la fila «Optimizador» muestra completados, fallidos por intento y ejecución p95 de la cola optimization', () => {
      expectQueueSignals('Optimizador', OPTIMIZATION);
    });
  });

  describe('T-04: grupo «Agente» (CA-11)', () => {
    const ASK = 'route="POST /api/v1/agent/ask"';

    it('CA-11: la fila «Agente» muestra las consultas por minuto', () => {
      expect(
        findExpr('Agente', `${HTTP_COUNT}{job="api",${ASK}}`, /^sum\(rate\(/, / \* 60$/),
      ).toBeDefined();
    });

    it('CA-11: la fila «Agente» muestra la latencia total p50 y p95', () => {
      for (const quantile of ['0.5', '0.95']) {
        expect(
          findExpr(
            'Agente',
            `histogram_quantile(${quantile},`,
            `nimbo_http_request_duration_seconds_bucket{job="api",${ASK}}`,
            'by (le)',
          ),
        ).toBeDefined();
      }
    });

    it('CA-11: la proporción de respuestas con error cuenta todo lo que no es 2xx (incluido el 429) y muestra 0 sin errores', () => {
      expect(
        findExpr(
          'Agente',
          `${ASK},status!~"2.."`,
          'or vector(0)) / ',
          `${HTTP_COUNT}{job="api",${ASK}}`,
        ),
      ).toBeDefined();
    });

    it('CA-11: el grupo no desglosa por plan ni por ninguna etiqueta fuera de route, status y le (PD-192)', () => {
      const labels = groupPanels('Agente').flatMap((panel) =>
        (panel.targets ?? []).flatMap((target) => labelsOf(target.expr, target.legendFormat)),
      );
      expect(labels.length).toBeGreaterThan(0);
      expect(labels.filter((label) => !['job', 'route', 'status', 'le'].includes(label))).toEqual(
        [],
      );
    });
  });

  describe('T-05: un solo tablero aprovisionado y runbook (CA-14, CA-15)', () => {
    const GROUPS = ['Identidad', 'Almacenamiento', 'Indexación', 'Optimizador', 'Agente'];

    it('CA-14: los grupos viven en el único tablero aprovisionado, sin otro tablero', () => {
      expect(readdirSync(join(ROOT, 'infra/grafana/dashboards'))).toEqual(['operacion.json']);
    });

    it('CA-15: el tablero aprovisionado trae las cinco filas de los módulos, en orden', () => {
      const rows = dashboardPanels()
        .filter((panel) => panel.type === 'row')
        .map((panel) => panel.title);
      expect(rows).toEqual(GROUPS);
    });

    it('CA-15: el runbook nombra las cinco filas, los paneles 16 a 35 y cómo generar su tráfico', () => {
      const runbook = read('docs/operations/observabilidad.md');
      for (const group of GROUPS) expect(runbook).toContain(`«${group}»`);
      for (const panel of dashboardPanels().filter((candidate) => candidate.id >= 16)) {
        expect(runbook).toContain(`| ${String(panel.id)} | ${panel.title} |`);
      }
      expect(runbook).toContain('POST /api/v1/auth/login');
    });
  });
});
