'use client';

import { type RoleName, SUPPORT_CONTACT_EMAIL } from '@nimbo/contracts';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { homePathFor } from '../home-path';

import { useFocusTitleOnMount } from './use-focus-title-on-mount';

const DESCRIPTION = `No tienes permiso para ver esta página. Si crees que es un error, escríbenos a ${SUPPORT_CONTACT_EMAIL}.`;

/** Estado ante un 403 (003 §6.9, CA-17): explica la falta de permiso y devuelve al inicio del rol. */
export function ForbiddenState({ role }: { readonly role: RoleName }): JSX.Element {
  const router = useRouter();
  const containerRef = useFocusTitleOnMount();

  return (
    <div ref={containerRef}>
      <StateView
        type="empty"
        icon={Lock}
        title="Sin permiso"
        description={DESCRIPTION}
        action={{ label: 'Ir a mi inicio', onClick: () => router.push(homePathFor(role)) }}
      />
    </div>
  );
}
