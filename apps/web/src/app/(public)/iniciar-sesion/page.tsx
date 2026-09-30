import type { ReactNode } from 'react';

import { buttonVariants } from '../../../components/ui/button';
import { getEnv } from '../../../env';
import { LoginForm } from '../../../features/identity/components/login-form';
import { SESSION_ENDED_PARAM, SESSION_ENDED_VALUE } from '../../../features/identity/routes';

interface IniciarSesionPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** Panel de marca del mockup (p. 07): solo en pantallas anchas. */
function BrandPanel(): ReactNode {
  return (
    <div className="hidden flex-col justify-center bg-agent-bg px-12 py-16 text-agent-text md:col-span-2 md:flex">
      <div className="max-w-sm space-y-4">
        <p className="flex items-center gap-2 text-xs font-medium text-agent-accent">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-agent-accent" />
          Agente Nimbo incluido en todos los planes
        </p>
        <p className="text-3xl font-bold leading-tight tracking-tight">
          Tu archivo, ordenado y buscable desde el primer día.
        </p>
        <p className="text-sm">
          Sube documentos, trabaja sobre ellos con tu equipo y pregunta al agente con citas a la
          página exacta.
        </p>
      </div>
    </div>
  );
}

/**
 * Inicio de sesión (spec 002 §11): dos columnas del mockup dentro de la cabecera pública. `?sesion=terminada` muestra
 * el aviso de CA-8. La URL pública de la API llega como prop, sin `NEXT_PUBLIC_*` (001 CA-29).
 */
export default async function IniciarSesionPage({
  searchParams,
}: IniciarSesionPageProps): Promise<ReactNode> {
  const env = getEnv();
  const query = await searchParams;
  const sessionEnded = query[SESSION_ENDED_PARAM] === SESSION_ENDED_VALUE;

  return (
    <div className="grid flex-1 md:grid-cols-5">
      <BrandPanel />
      <div className="flex flex-col px-4 py-6 md:col-span-3 md:px-8">
        <p className="flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
          ¿No tienes cuenta?
          <a href="/registro" className={buttonVariants({ variant: 'outline' })}>
            Crear cuenta
          </a>
        </p>
        <div className="flex flex-1 items-center justify-center py-10">
          <LoginForm apiPublicUrl={env.API_PUBLIC_URL} sessionEnded={sessionEnded} />
        </div>
      </div>
    </div>
  );
}
