/**
 * Se ejecuta una vez al arrancar el servidor de Next.js (CA-18 en `web`): si la configuración es inválida,
 * escribe una única línea `config.invalid` y termina antes de atender peticiones.
 */
export async function register(): Promise<void> {
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') {
    return;
  }
  const { loadWebEnv } = await import('./env');
  const result = loadWebEnv();
  if (!result.ok) {
    process.stderr.write(`${JSON.stringify({ event: 'config.invalid', issues: result.issues })}\n`);
    process.exit(1);
  }
}
