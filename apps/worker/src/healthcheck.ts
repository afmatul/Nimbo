// `HEALTHCHECK` de la imagen `nimbo-worker` (CA-23): consulta `/health/ready` (Redis) del proceso y sale con `1`
// si no responde `200`. Lo ejecuta `node dist/healthcheck.js [VARIABLE]` dentro del contenedor: la misma imagen corre
// el `worker` general (`WORKER_PORT`, por omisión) y el `worker-optimizer` (`WORKER_OPTIMIZER_PORT`, ADR-0038).
const DEFAULT_PORTS: Readonly<Record<string, number>> = {
  WORKER_PORT: 3001,
  WORKER_OPTIMIZER_PORT: 3003,
};
const TIMEOUT_MS = 3000;

async function main(): Promise<number> {
  const variable = process.argv[2] ?? 'WORKER_PORT';
  const fallback = DEFAULT_PORTS[variable];
  if (fallback === undefined) return 1;
  const port = process.env[variable] ?? String(fallback);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health/ready`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.status === 200 ? 0 : 1;
  } catch {
    return 1;
  }
}

void main().then((code) => {
  process.exitCode = code;
});
