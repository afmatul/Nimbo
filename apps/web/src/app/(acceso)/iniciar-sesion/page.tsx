import type { ReactNode } from 'react';

import { BrandMark } from '../../../components/nimbo/brand-mark';
import { buttonVariants } from '../../../components/ui/button';
import { getEnv } from '../../../env';
import { LoginForm } from '../../../features/identity/components/login-form';
import { SESSION_ENDED_PARAM, SESSION_ENDED_VALUE } from '../../../features/identity/routes';
import { cn } from '../../../lib/utils';

interface IniciarSesionPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** Logotipo «NIMBO» del mockup: el isotipo y el nombre en mayúsculas; `inverse` sobre el panel oscuro. */
function Wordmark({ inverse = false }: { readonly inverse?: boolean }): ReactNode {
  return (
    <p
      className={cn(
        'flex items-center gap-2 text-sm font-bold tracking-widest',
        inverse ? 'text-agent-text' : 'text-foreground',
      )}
    >
      <BrandMark className="h-6 w-auto" />
      NIMBO
    </p>
  );
}

/** Panel de marca del mockup (p. 07): logotipo arriba y, centrados, la píldora del agente y el titular. Solo en anchas. */
function BrandPanel(): ReactNode {
  return (
    <aside
      aria-label="Nimbo"
      className="hidden flex-col bg-agent-bg px-12 py-10 text-agent-text md:col-span-2 md:flex"
    >
      <Wordmark inverse />
      <div className="flex flex-1 flex-col justify-center gap-5 py-12">
        <p className="flex w-fit items-center gap-2 rounded-full bg-agent-tag px-3 py-1 text-xs font-medium">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-agent-accent" />
          Agente Nimbo incluido en todos los planes
        </p>
        <p className="max-w-sm text-4xl font-bold leading-tight tracking-tight">
          Tu archivo, ordenado y buscable desde el primer día.
        </p>
        <p className="max-w-sm text-sm leading-relaxed">
          Sube documentos, trabaja sobre ellos con tu equipo y pregunta al agente con citas a la
          página exacta.
        </p>
      </div>
    </aside>
  );
}

/** Barra superior del mockup: «¿No tienes cuenta?» y «Crear cuenta»; en móvil, también el logotipo. */
function TopBar(): ReactNode {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="md:hidden">
        <Wordmark />
      </div>
      <nav aria-label="Cuenta" className="ml-auto flex items-center gap-3 text-sm">
        <span className="hidden text-secondary-foreground sm:inline">¿No tienes cuenta?</span>
        <a href="/registro" className={buttonVariants({ variant: 'outline' })}>
          Crear cuenta
        </a>
      </nav>
    </div>
  );
}

/**
 * Inicio de sesión (spec 002 §11, mockup p. 07): panel de marca a la izquierda y, a la derecha, la barra superior y el
 * formulario, a pantalla completa. `?sesion=terminada` muestra el aviso de CA-8. La URL pública de la API llega como
 * prop, sin `NEXT_PUBLIC_*` (001 CA-29).
 */
export default async function IniciarSesionPage({
  searchParams,
}: IniciarSesionPageProps): Promise<ReactNode> {
  const env = getEnv();
  const query = await searchParams;
  const sessionEnded = query[SESSION_ENDED_PARAM] === SESSION_ENDED_VALUE;

  return (
    <div className="grid min-h-screen md:grid-cols-5">
      <BrandPanel />
      <div className="flex flex-col bg-card px-4 py-5 md:col-span-3 md:px-10 md:py-8">
        <TopBar />
        <div className="flex flex-1 items-center justify-center py-10">
          <LoginForm apiPublicUrl={env.API_PUBLIC_URL} sessionEnded={sessionEnded} />
        </div>
      </div>
    </div>
  );
}
