import type { JSX } from 'react';

import { getEnv } from '../../../../env';
import { SecurityView } from '../../../../features/identity/components/security-view';

/**
 * «Seguridad» (spec 002, plan §6.9): en `(app)`, fuera de `(cliente)` e `(interno)`, para los cuatro roles. La URL de
 * la API se lee en el servidor (CA-29 de 000) y la vista arma sus peticiones con la sesión en memoria.
 */
export default function SeguridadPage(): JSX.Element {
  return <SecurityView apiPublicUrl={getEnv().API_PUBLIC_URL} />;
}
