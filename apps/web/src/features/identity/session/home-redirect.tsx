'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type JSX } from 'react';

import { FocusedLayout } from '../../../components/nimbo/focused-layout';
import { StateView } from '../../../components/nimbo/state-view';
import { homePathFor } from '../../access/home-path';
import { LOGIN_PATH } from '../routes';

import { useSession } from './session-provider';

/** La raíz `/`: con sesión, al inicio del rol; sin ella (o vencida), a iniciar sesión. */
export function HomeRedirect(): JSX.Element {
  const { status, user } = useSession();
  const router = useRouter();
  const target = user === null ? null : homePathFor(user.role);

  useEffect(() => {
    if (status === 'loading') return;
    router.replace(status === 'authenticated' && target !== null ? target : LOGIN_PATH);
  }, [status, target, router]);

  return (
    <FocusedLayout>
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <StateView type="loading" title="Cargando Nimbo…" />
      </div>
    </FocusedLayout>
  );
}
