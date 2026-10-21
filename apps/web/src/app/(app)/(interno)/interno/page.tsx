'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { areaHomePathFor } from '../../../../features/access/home-path';
import { useSession } from '../../../../features/identity/session/session-provider';

/**
 * Inicio común de ADMIN, SUPPORT y OPERATOR (003 §6.9, 011 CA-17): lleva al área del rol con `areaHomePathFor` y no
 * dibuja nada. Sin sesión no decide: de eso se encarga `SessionGate`.
 */
export default function InternoPage(): null {
  const { user } = useSession();
  const router = useRouter();
  const target = user === null ? null : areaHomePathFor(user.role);

  useEffect(() => {
    if (target !== null) router.replace(target);
  }, [target, router]);

  return null;
}
