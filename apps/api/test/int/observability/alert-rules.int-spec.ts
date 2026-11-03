import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

import { PROMETHEUS_IMAGE } from '../setup/containers';

/**
 * Banco de reglas de 022 (plan §6): cada expresión se lee de `alertas.json` (sin copiarla) y se evalúa con
 * `/api/v1/query?time=` contra series sintéticas cargadas con `promtool` en un Prometheus con tiempo fijo. El `for`
 * se comprueba de forma estática en `scripts/observability.spec.ts`; aquí, la expresión y su umbral por instante.
 *
 * Cada caso ocupa su propia ventana de tiempo (`WINDOW_SECONDS`), separadas por más que el `lookback` de 5 min, así
 * que los casos no se mezclan aunque compartan series. Para sumar una regla: su lista de casos y agregarla a `CASES`.
 */

const ALERTING_FILE = resolve(
  __dirname,
  '../../../../../infra/grafana/provisioning/alerting/alertas.json',
);
const PROMETHEUS_PORT = 9090;
const SERIES_FILE = '/tmp/series.om';
/** Inicio fijo de la primera ventana (2027-01-15): lejos de «ahora», sin relojes reales. */
const EPOCH_SECONDS = 1_800_000_000;
const WINDOW_SECONDS = 3600;
/** Las muestras cubren 20 min de cada ventana, cada 15 s (el intervalo de recolección, plan §5). */
const SAMPLE_STEP_SECONDS = 15;
const SAMPLED_SECONDS = 1200;

type Labels = Readonly<Record<string, string>>;

/** Una serie sintética: un contador que crece `perSecond` o un gauge constante en `value`. */
interface Series {
  readonly name: string;
  readonly labels: Labels;
  readonly perSecond?: number;
  readonly value?: number;
}

interface RuleCase {
  readonly rule: string;
  readonly name: string;
  readonly series: readonly Series[];
  readonly fires: boolean;
}

interface AlertQuery {
  readonly refId: string;
  readonly datasourceUid: string;
  readonly model: {
    readonly expr?: string;
    readonly conditions?: readonly { evaluator: { type: string; params: number[] } }[];
  };
}
interface AlertRule {
  readonly uid: string;
  readonly condition: string;
  readonly data: readonly AlertQuery[];
}
/** Tipos de umbral de Grafana que admite el banco. */
type ThresholdType = 'gt' | 'lt';
interface Rule {
  readonly expr: string;
  readonly type: ThresholdType;
  readonly threshold: number;
}

const isThresholdType = (type: string | undefined): type is ThresholdType =>
  type === 'gt' || type === 'lt';

const loadRule = (uid: string): Rule => {
  const file = JSON.parse(readFileSync(ALERTING_FILE, 'utf8')) as {
    groups: { rules: AlertRule[] }[];
  };
  const rule = file.groups
    .flatMap((group) => group.rules)
    .find((candidate) => candidate.uid === uid);
  const expr = rule?.data.find((query) => query.datasourceUid === 'prometheus')?.model.expr;
  const evaluator = rule?.data.find((query) => query.refId === rule.condition)?.model
    .conditions?.[0]?.evaluator;
  const type = evaluator?.type;
  const threshold = evaluator?.params[0];
  if (expr === undefined || !isThresholdType(type) || threshold === undefined) {
    throw new Error(
      `La regla ${uid} no está en alertas.json con una consulta y un umbral «gt» o «lt».`,
    );
  }
  return { expr, type, threshold };
};

const breaches = (value: number, { type, threshold }: Rule): boolean =>
  type === 'gt' ? value > threshold : value < threshold;

const counter = (name: string, labels: Labels, perSecond: number): Series => ({
  name,
  labels,
  perSecond,
});

const gauge = (name: string, labels: Labels, value: number): Series => ({ name, labels, value });

const HTTP_COUNT = 'nimbo_http_request_duration_seconds_count';
const HTTP_BUCKET = 'nimbo_http_request_duration_seconds_bucket';
/** Bordes de los buckets HTTP alrededor del umbral de 0,3 s (los del middleware incluyen estos). */
const HTTP_BUCKET_BOUNDS = ['0.1', '0.3', '0.5', '1', '+Inf'] as const;

/** `perSecond` peticiones del `api` a `route`, todas de `seconds` de duración: buckets y conteo. */
const httpTraffic = (route: string, perSecond: number, seconds: number): Series[] => {
  const labels = { job: 'api', route, status: '200' };
  const buckets = HTTP_BUCKET_BOUNDS.map((le) =>
    counter(HTTP_BUCKET, { ...labels, le }, le === '+Inf' || Number(le) >= seconds ? perSecond : 0),
  );
  return [...buckets, counter(HTTP_COUNT, labels, perSecond)];
};

const httpStatus = (status: string, perSecond: number): Series =>
  counter(HTTP_COUNT, { job: 'api', route: 'GET /api/v1/files/:fileId', status }, perSecond);

const FAST_SECONDS = 0.05;
const SLOW_SECONDS = 0.45;
const FILES_ROUTE = 'GET /api/v1/files/:fileId';

const RULE_5XX_CASES: RuleCase[] = [
  {
    rule: 'nimbo-5xx',
    name: '5 % de 5xx dispara',
    series: [httpStatus('200', 9.5), httpStatus('500', 0.5)],
    fires: true,
  },
  {
    rule: 'nimbo-5xx',
    name: '1 % de 5xx no dispara',
    series: [httpStatus('200', 9.9), httpStatus('503', 0.1)],
    fires: false,
  },
  {
    rule: 'nimbo-5xx',
    name: 'los 5xx de otro proceso no cuentan',
    series: [
      httpStatus('200', 9.9),
      httpStatus('500', 0.1),
      counter(HTTP_COUNT, { job: 'worker', route: FILES_ROUTE, status: '500' }, 5),
    ],
    fires: false,
  },
];

const RULE_P95_CASES: RuleCase[] = [
  {
    rule: 'nimbo-latencia-p95',
    name: 'p95 de 450 ms en una consulta de UI dispara',
    series: httpTraffic(FILES_ROUTE, 10, SLOW_SECONDS),
    fires: true,
  },
  {
    rule: 'nimbo-latencia-p95',
    name: 'p95 de 50 ms no dispara',
    series: httpTraffic(FILES_ROUTE, 10, FAST_SECONDS),
    fires: false,
  },
  {
    rule: 'nimbo-latencia-p95',
    name: 'las dos rutas excluidas por RNF-01 (S-5) lentas no disparan',
    series: [
      ...httpTraffic(FILES_ROUTE, 10, FAST_SECONDS),
      ...httpTraffic('POST /api/v1/agent/ask', 10, SLOW_SECONDS),
      ...httpTraffic('GET /api/v1/editing/content/:token', 10, SLOW_SECONDS),
    ],
    fires: false,
  },
];

const DEPENDENCY_UP = 'nimbo_dependency_up';
const dependencyUp = (job: string, dependency: string, value: number): Series =>
  gauge(DEPENDENCY_UP, { job, dependency }, value);

const RULE_5_CASES: RuleCase[] = [
  {
    rule: 'nimbo-dependencia-caida',
    name: 'Redis caído dispara',
    series: [dependencyUp('api', 'postgres', 1), dependencyUp('api', 'redis', 0)],
    fires: true,
  },
  {
    rule: 'nimbo-dependencia-caida',
    name: 'ONLYOFFICE caído dispara aunque el resto esté arriba (CA-15)',
    series: [dependencyUp('api', 'minio', 1), dependencyUp('api', 'onlyoffice', 0)],
    fires: true,
  },
  {
    rule: 'nimbo-dependencia-caida',
    name: 'Redis caído para un solo proceso dispara (mínimo por dependencia)',
    series: [dependencyUp('api', 'redis', 1), dependencyUp('worker', 'redis', 0)],
    fires: true,
  },
  {
    rule: 'nimbo-dependencia-caida',
    name: 'todas las dependencias arriba no dispara',
    series: ['postgres', 'redis', 'minio', 'onlyoffice'].map((dependency) =>
      dependencyUp('api', dependency, 1),
    ),
    fires: false,
  },
];

const FS_USAGE = 'container_fs_usage_bytes';
const FS_LIMIT = 'container_fs_limit_bytes';
const FS_LIMIT_BYTES = 100 * 1024 ** 3;

/** Uso y límite de un sistema de archivos visto por cAdvisor, al `fraction` de su capacidad. */
const filesystem = (device: string, fraction: number, id = '/'): Series[] => {
  const labels = { id, device };
  return [
    gauge(FS_USAGE, labels, fraction * FS_LIMIT_BYTES),
    gauge(FS_LIMIT, labels, FS_LIMIT_BYTES),
  ];
};

const RULE_DISK_CASES: RuleCase[] = [
  {
    rule: 'nimbo-disco',
    name: 'un disco del anfitrión al 85 % dispara',
    series: filesystem('/dev/vda', 0.85),
    fires: true,
  },
  {
    rule: 'nimbo-disco',
    name: 'un disco del anfitrión al 50 % no dispara',
    series: filesystem('/dev/vda', 0.5),
    fires: false,
  },
  {
    rule: 'nimbo-disco',
    name: 'el segundo disco de bloque al 85 % dispara aunque el primero esté al 50 % (PD-170)',
    series: [...filesystem('/dev/vda', 0.5), ...filesystem('/dev/sdc', 0.85)],
    fires: true,
  },
  {
    rule: 'nimbo-disco',
    name: 'tmpfs, overlay y /dev al 95 % no disparan (PD-170)',
    series: [
      ...filesystem('/dev/vda', 0.5),
      ...filesystem('tmpfs', 0.95),
      ...filesystem('overlay', 0.95),
      ...filesystem('/dev', 0.95),
    ],
    fires: false,
  },
  {
    rule: 'nimbo-disco',
    name: 'un contenedor al 95 % no cuenta como disco del anfitrión',
    series: [...filesystem('/dev/vda', 0.5), ...filesystem('/dev/vda', 0.95, '/docker/abc')],
    fires: false,
  },
];

const QUEUE_JOBS = 'nimbo_queue_jobs';
const QUEUE_FAILURES = 'nimbo_queue_job_failures_total';
const MAIL = { job: 'worker', queue: 'mail' };
const INDEXING = { job: 'worker', queue: 'indexing' };

/** Trabajos de `queue` en `state`, constantes durante la ventana. */
const queueJobs = (queue: Labels, state: string, count: number): Series =>
  gauge(QUEUE_JOBS, { ...queue, state }, count);

/** Fallos con `attempts_made`: crecen `perSecond` o, con 0, quedan quietos en su valor de arranque. */
const queueFailures = (queue: Labels, attemptsMade: string, perSecond: number): Series =>
  perSecond === 0
    ? gauge(QUEUE_FAILURES, { ...queue, attempts_made: attemptsMade }, 1)
    : counter(QUEUE_FAILURES, { ...queue, attempts_made: attemptsMade }, perSecond);

/** Una cola sin pendientes ni fallos agotados: la regla ve datos y no dispara. */
const QUIET_QUEUE: Series[] = [
  queueJobs(INDEXING, 'waiting', 0),
  queueJobs(INDEXING, 'prioritized', 0),
  queueFailures(INDEXING, '3+', 0),
];

const RULE_3_CASES: RuleCase[] = [
  {
    rule: 'nimbo-colas',
    name: '51 pendientes (40 en espera y 11 priorizados) en una cola disparan',
    series: [...QUIET_QUEUE, queueJobs(MAIL, 'waiting', 40), queueJobs(MAIL, 'prioritized', 11)],
    fires: true,
  },
  {
    rule: 'nimbo-colas',
    name: '50 pendientes no disparan, aunque haya 500 diferidos (S-2)',
    series: [
      ...QUIET_QUEUE,
      queueJobs(MAIL, 'waiting', 50),
      queueJobs(MAIL, 'prioritized', 0),
      queueJobs(MAIL, 'delayed', 500),
    ],
    fires: false,
  },
  {
    rule: 'nimbo-colas',
    name: 'los pendientes de dos colas no se suman',
    series: [queueJobs(MAIL, 'waiting', 30), queueJobs(INDEXING, 'waiting', 30)],
    fires: false,
  },
  {
    rule: 'nimbo-colas',
    name: 'un trabajo con su tercer intento fallido en 5 min dispara, sin pendientes en su cola (S-1)',
    series: [
      ...QUIET_QUEUE,
      queueJobs(MAIL, 'waiting', 0),
      counter(QUEUE_FAILURES, { ...MAIL, attempts_made: '3+' }, 0.002),
    ],
    fires: true,
  },
  {
    rule: 'nimbo-colas',
    name: 'fallos de primer y segundo intento no disparan',
    series: [
      ...QUIET_QUEUE,
      queueFailures(MAIL, '1', 0.1),
      queueFailures(MAIL, '2', 0.1),
      queueFailures(MAIL, '3+', 0),
    ],
    fires: false,
  },
];

const RENEWAL = { job: 'worker', queue: 'subscription-renewal' };

const RULE_6_CASES: RuleCase[] = [
  {
    rule: 'nimbo-renovacion',
    name: 'una pasada de renovación fallida en 15 min dispara, al primer intento (S-4)',
    series: [counter(QUEUE_FAILURES, { ...RENEWAL, attempts_made: '1' }, 0.001)],
    fires: true,
  },
  {
    rule: 'nimbo-renovacion',
    name: 'sin fallos nuevos de la renovación en 15 min no dispara',
    series: [queueFailures(RENEWAL, '1', 0), queueFailures(RENEWAL, '3+', 0)],
    fires: false,
  },
  {
    rule: 'nimbo-renovacion',
    name: 'los fallos de otras colas no disparan',
    series: [queueFailures(RENEWAL, '1', 0), queueFailures(MAIL, '1', 0.1)],
    fires: false,
  },
];

const CASES: readonly RuleCase[] = [
  ...RULE_5XX_CASES,
  ...RULE_P95_CASES,
  ...RULE_5_CASES,
  ...RULE_DISK_CASES,
  ...RULE_3_CASES,
  ...RULE_6_CASES,
];

const windowStart = (index: number): number => EPOCH_SECONDS + index * WINDOW_SECONDS;
const evaluatedAt = (index: number): number => windowStart(index) + SAMPLED_SECONDS;

const labelText = (labels: Labels): string =>
  Object.entries(labels)
    .map(([key, value]) => `${key}="${value}"`)
    .join(',');

const samplesOf = (series: Series, start: number): string[] => {
  const lines: string[] = [];
  for (let elapsed = 0; elapsed <= SAMPLED_SECONDS; elapsed += SAMPLE_STEP_SECONDS) {
    const value = series.value ?? (series.perSecond ?? 0) * elapsed;
    lines.push(
      `${series.name}{${labelText(series.labels)}} ${String(value)} ${String(start + elapsed)}`,
    );
  }
  return lines;
};

/** OpenMetrics sin `TYPE` (familias desconocidas), con las muestras de cada serie juntas y en orden. */
const openMetricsOf = (cases: readonly RuleCase[]): string => {
  const byName = new Map<string, string[]>();
  cases.forEach((ruleCase, index) => {
    for (const series of ruleCase.series) {
      const lines = byName.get(series.name) ?? [];
      lines.push(...samplesOf(series, windowStart(index)));
      byName.set(series.name, lines);
    }
  });
  return `${[...byName.values()].flat().join('\n')}\n# EOF\n`;
};

const startPrometheus = async (series: string): Promise<StartedTestContainer> =>
  new GenericContainer(PROMETHEUS_IMAGE)
    .withCopyContentToContainer([{ content: series, target: SERIES_FILE }])
    .withEntrypoint(['/bin/sh', '-c'])
    .withCommand([
      `promtool tsdb create-blocks-from openmetrics ${SERIES_FILE} /prometheus && ` +
        'exec prometheus --config.file=/etc/prometheus/prometheus.yml --storage.tsdb.path=/prometheus',
    ])
    .withExposedPorts(PROMETHEUS_PORT)
    .withWaitStrategy(Wait.forHttp('/-/ready', PROMETHEUS_PORT))
    .start();

interface QueryResponse {
  readonly status: string;
  readonly data: { readonly result: readonly { readonly value: [number, string] }[] };
}

/** Valores del vector instantáneo de `expr` en `time` (segundos). */
const queryAt = async (prometheus: StartedTestContainer, expr: string, time: number) => {
  const url = new URL(
    `http://${prometheus.getHost()}:${String(prometheus.getMappedPort(PROMETHEUS_PORT))}/api/v1/query`,
  );
  url.search = new URLSearchParams({ query: expr, time: String(time) }).toString();
  const body = (await (await fetch(url)).json()) as QueryResponse;
  if (body.status !== 'success') throw new Error(`Prometheus rechazó la expresión: ${expr}`);
  return body.data.result.map((sample) => Number(sample.value[1]));
};

describe('022: banco de reglas de alerta (CA-11, CA-12)', () => {
  let prometheus: StartedTestContainer;

  beforeAll(async () => {
    prometheus = await startPrometheus(openMetricsOf(CASES));
  });

  afterAll(async () => {
    await prometheus.stop();
  });

  it.each(CASES.map((ruleCase, index) => [ruleCase.rule, ruleCase.name, ruleCase, index] as const))(
    '%s: %s',
    async (_rule, _name, ruleCase, index) => {
      const rule = loadRule(ruleCase.rule);

      const values = await queryAt(prometheus, rule.expr, evaluatedAt(index));

      // La expresión ve las series del caso: un «no dispara» nunca pasa por falta de datos.
      expect(values.length).toBeGreaterThan(0);
      expect(values.some((value) => breaches(value, rule))).toBe(ruleCase.fires);
    },
  );
});
