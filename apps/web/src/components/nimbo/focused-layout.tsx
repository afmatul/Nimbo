'use client';

import type * as React from 'react';

import { Toaster } from '../ui/sonner';

import { BrandLogo } from './brand-logo';
import { useHeaderAccount, useHeaderHome } from './header-account';

/**
 * Marco de las pantallas enfocadas en una sola tarea, sin barra lateral (el pago de 009 y 010, la página no encontrada):
 * la cabecera conserva el logo y, con sesión, el menú de la cuenta, como en el `AppLayout`.
 */
export function FocusedLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const account = useHeaderAccount();
  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground overflow-x-clip">
      <header className="sticky top-0 z-40 flex h-header w-full items-center justify-between border-b border-border bg-card px-4 md:px-6 shadow-sm">
        <BrandLogo href={useHeaderHome()} />
        {account ? <div className="flex items-center gap-3">{account}</div> : null}
      </header>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      <Toaster />
    </div>
  );
}
