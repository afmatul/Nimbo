'use client';

import { LogOut } from 'lucide-react';
import { useState, type JSX } from 'react';

import { Button } from '../../../components/ui/button';
import { useSession } from '../session/session-provider';

/** Cierra la sesión de este navegador; `SessionGate` lleva luego a iniciar sesión. */
export function SignOutButton(): JSX.Element {
  const { signOut } = useSession();
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      loading={pending}
      onClick={() => {
        setPending(true);
        void signOut();
      }}
    >
      {pending ? null : <LogOut aria-hidden="true" className="h-4 w-4" />}
      Cerrar sesión
    </Button>
  );
}
