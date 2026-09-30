'use client';

import type { JSX } from 'react';

import { InternalAreaPlaceholder } from '../../../../features/access/components/internal-area-placeholder';
import { useSession } from '../../../../features/identity/session/session-provider';

/** Inicio de ADMIN, SUPPORT y OPERATOR (003 §6.9, CA-17): marcador hasta que 011 construya el área. */
export default function InternoPage(): JSX.Element | null {
  const { user, signOut } = useSession();
  if (user === null) return null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Área interna</h1>
      <InternalAreaPlaceholder
        fullName={user.fullName}
        role={user.role}
        onLogout={() => void signOut()}
      />
    </main>
  );
}
