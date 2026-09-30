'use client';

import type { RoleName } from '@nimbo/contracts';
import { SearchX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { homePathFor } from '../home-path';

import { useFocusTitleOnMount } from './use-focus-title-on-mount';

const PUBLIC_HOME = '/';
const MESSAGE = 'No encontramos lo que buscas. Puede que no exista o que no tengas acceso.';

/**
 * Estado ante un 404 (003 §6.9, CA-17). El mismo texto cubre «no existe» y «sin acceso» (CA-11). Con `role`
 * devuelve al inicio del rol; sin sesión, a la raíz.
 */
export function NotFoundState({ role }: { readonly role?: RoleName }): JSX.Element {
  const router = useRouter();
  const containerRef = useFocusTitleOnMount();
  const action =
    role === undefined
      ? { label: 'Ir al inicio', href: PUBLIC_HOME }
      : { label: 'Ir a mi inicio', href: homePathFor(role) };

  return (
    <div ref={containerRef}>
      <StateView
        type="empty"
        icon={SearchX}
        title={MESSAGE}
        action={{ label: action.label, onClick: () => router.push(action.href) }}
      />
    </div>
  );
}
