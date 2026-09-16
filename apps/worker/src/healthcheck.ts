// `HEALTHCHECK` de la imagen `nimbo-worker` (CA-23): consulta la salud interna del proceso y sale con `1`
// si no responde `200`. T-22 lo apunta a `/health/ready` (Redis) cuando exista el indicador.
const DEFAULT_WORKER_PORT = 3001;
const TIMEOUT_MS = 3000;

async function main(): Promise<number> {
  const port = process.env['WORKER_PORT'] ?? String(DEFAULT_WORKER_PORT);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health/live`, {
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
