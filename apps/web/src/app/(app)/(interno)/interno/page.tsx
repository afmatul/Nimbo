'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type JSX } from 'react';

import { InternalAreaLayout } from '../../../../features/access/components/internal-area-layout';
import { InternalAreaPlaceholder } from '../../../../features/access/components/internal-area-placeholder';
import { areaHomePathFor } from '../../../../features/access/home-path';
import { useSession } from '../../../../features/identity/session/session-provider';

/**
 * Inicio común de ADMIN, SUPPORT y OPERATOR (003 §6.9, 011 CA-17): lleva al área del rol si ya existe; si no, muestra el
 * marcador. El marcador se retira en T-13 (PR-B), cuando existan /admin/cuentas y /operacion/metricas. Sin sesión no
 * decide: de eso se encarga `SessionGate`. El marcador va en el marco interno: «Seguridad», «Mi actividad» y «Cerrar
 * sesión» están en el menú de la cuenta.
 */
export default function InternoPage(): JSX.Element | null {
  const { user } = useSession();
  const router = useRouter();
  const target = user === null ? null : areaHomePathFor(user.role);

  useEffect(() => {
    if (target !== null) router.replace(target);
  }, [target, router]);

  if (user === null || target !== null) return null;
  return (
    <InternalAreaLayout>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Área interna</h1>
        <InternalAreaPlaceholder fullName={user.fullName} role={user.role} />
      </div>
    </InternalAreaLayout>
  );
}
