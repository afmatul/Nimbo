import type { ReactNode } from 'react';

import { getEnv } from '../env';
import { getApiHealth } from '../lib/api-health';

const API_UNAVAILABLE_TEXT = 'API: no disponible. Revisa el estado de los servicios.';
const API_AVAILABLE_TEXT = 'API: disponible';

/** Se evalúa en cada petición: el estado de la API no se cachea ni se hornea en el build (CA-29). */
export const dynamic = 'force-dynamic';

/** Página de estado (CA-33): nombre, ambiente y resultado de `health/ready` de la API. Server Component. */
export default async function StatusPage(): Promise<ReactNode> {
  const env = getEnv();
  const health = await getApiHealth(env.API_INTERNAL_URL);

  return (
    <main>
      <h1>Nimbo</h1>
      <p>Ambiente: {env.APP_ENV}</p>
      <p>{health.availability === 'disponible' ? API_AVAILABLE_TEXT : API_UNAVAILABLE_TEXT}</p>
      {health.version !== undefined && <p>Versión de la API: {health.version}</p>}
    </main>
  );
}
