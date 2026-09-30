'use client';

import type { JSX } from 'react';

import { InternalAreaPlaceholder } from '../../../../features/access/components/internal-area-placeholder';
import { SignOutButton } from '../../../../features/identity/components/sign-out-button';
import { useSession } from '../../../../features/identity/session/session-provider';

/** Inicio de ADMIN, SUPPORT y OPERATOR (003 §6.9, CA-17): marcador hasta que 011 construya el área. */
export default function InternoPage(): JSX.Element | null {
  const { user } = useSession();
  if (user === null) return null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Área interna</h1>
        <SignOutButton />
      </div>
      <InternalAreaPlaceholder fullName={user.fullName} role={user.role} />
    </main>
  );
}
