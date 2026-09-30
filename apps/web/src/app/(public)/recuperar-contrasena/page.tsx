import type { ReactNode } from 'react';

import { getEnv } from '../../../env';
import { RequestResetForm } from '../../../features/identity/components/request-reset-form';

/** Recuperar contraseña (spec 002 §11, CA-18). La URL pública de la API llega como prop (001 CA-29). */
export default function RecuperarContrasenaPage(): ReactNode {
  const env = getEnv();
  return <RequestResetForm apiPublicUrl={env.API_PUBLIC_URL} />;
}
