import { once } from 'node:events';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { HealthReadyResponse } from '@nimbo/contracts';
import { Registry } from 'prom-client';

import { READY_TIMEOUT_MS } from '../../application/health/health.service';

import {
  DEPENDENCY_UP,
  DependencyMetricsCollector,
  OnlyOfficeProbe,
  onlyOfficeProbeFor,
} from './dependency-metrics.collector';

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

/** ONLYOFFICE de mentira en `127.0.0.1`: responde `/healthcheck` con lo que diga el caso. */
const startOnlyOffice = async (handler: Handler): Promise<{ server: Server; url: string }> => {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${String(port)}/docs` };
};

const healthcheckReplying =
  (body: string): Handler =>
  (request, response) => {
    if (request.url === '/docs/healthcheck') {
      response.writeHead(200).end(body);
      return;
    }
    response.writeHead(404).end();
  };

const healthReporting = (checks: HealthReadyResponse['checks']) => ({
  ready: (): Promise<HealthReadyResponse> =>
    Promise.resolve({
      status: Object.values(checks).every((value) => value === 'up') ? 'ok' : 'error',
      checks,
    }),
});

/** Valor de `nimbo_dependency_up` por dependencia, tal como lo recolectaría Prometheus. */
const dependencyValues = async (registry: Registry): Promise<Record<string, number>> => {
  const metric = await registry.getSingleMetric(DEPENDENCY_UP)?.get();
  return Object.fromEntries(
    (metric?.values ?? []).map((sample) => [String(sample.labels.dependency), sample.value]),
  );
};

describe('DependencyMetricsCollector (022 T-06: CA-3, CA-15, RN-4)', () => {
  let onlyOffice: { server: Server; url: string } | undefined;

  afterEach(async () => {
    if (onlyOffice !== undefined) {
      onlyOffice.server.closeAllConnections();
      onlyOffice.server.close();
      await once(onlyOffice.server, 'close');
      onlyOffice = undefined;
    }
  });

  it('CA-3: publica 1 por cada dependencia que `ready` da arriba, con su nombre como única etiqueta', async () => {
    const registry = new Registry();
    new DependencyMetricsCollector(
      registry,
      healthReporting({ postgres: 'up', redis: 'up', minio: 'up' }),
      null,
    );

    await expect(dependencyValues(registry)).resolves.toEqual({ postgres: 1, redis: 1, minio: 1 });
    const text = await registry.metrics();
    expect(text).toContain('nimbo_dependency_up{dependency="redis"} 1');
  });

  it('CA-15: una dependencia que `ready` da caída queda en 0', async () => {
    const registry = new Registry();
    new DependencyMetricsCollector(
      registry,
      healthReporting({ postgres: 'up', redis: 'down', minio: 'up' }),
      null,
    );

    await expect(dependencyValues(registry)).resolves.toEqual({ postgres: 1, redis: 0, minio: 1 });
  });

  it('CA-3: el worker solo publica lo que comprueba su `ready` (Redis)', async () => {
    const registry = new Registry();
    new DependencyMetricsCollector(registry, healthReporting({ redis: 'up' }), null);

    await expect(dependencyValues(registry)).resolves.toEqual({ redis: 1 });
  });

  it('CA-15: ONLYOFFICE que responde `true` en `/healthcheck` queda en 1', async () => {
    onlyOffice = await startOnlyOffice(healthcheckReplying('true\n'));
    const registry = new Registry();
    new DependencyMetricsCollector(
      registry,
      healthReporting({ redis: 'up' }),
      new OnlyOfficeProbe(onlyOffice.url),
    );

    await expect(dependencyValues(registry)).resolves.toEqual({ redis: 1, onlyoffice: 1 });
  });

  it('CA-15: ONLYOFFICE que responde algo distinto de `true` queda en 0', async () => {
    onlyOffice = await startOnlyOffice(healthcheckReplying('false'));

    await expect(new OnlyOfficeProbe(onlyOffice.url).isUp()).resolves.toBe(false);
  });

  it('CA-15: ONLYOFFICE que no escucha queda en 0', async () => {
    onlyOffice = await startOnlyOffice(healthcheckReplying('true'));
    const { url } = onlyOffice;
    onlyOffice.server.close();
    await once(onlyOffice.server, 'close');
    onlyOffice = undefined;

    await expect(new OnlyOfficeProbe(url).isUp()).resolves.toBe(false);
  });

  it('CA-15: ONLYOFFICE que no responde queda en 0 sin esperar más que el límite de `ready`', async () => {
    onlyOffice = await startOnlyOffice(() => undefined);
    const startedAt = performance.now();

    await expect(new OnlyOfficeProbe(onlyOffice.url).isUp()).resolves.toBe(false);
    expect(performance.now() - startedAt).toBeLessThan(READY_TIMEOUT_MS + 500);
  });

  it('RN-4: sin `ONLYOFFICE_INTERNAL_URL` no hay sonda ni serie de ONLYOFFICE', () => {
    expect(onlyOfficeProbeFor({ REDIS_URL: 'redis://localhost:6379' })).toBeNull();
    expect(onlyOfficeProbeFor({ ONLYOFFICE_INTERNAL_URL: undefined })).toBeNull();
    expect(onlyOfficeProbeFor({ ONLYOFFICE_INTERNAL_URL: 'http://onlyoffice' })).toBeInstanceOf(
      OnlyOfficeProbe,
    );
  });
});
