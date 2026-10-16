'use client';

import type * as React from 'react';

import { AppLayout } from '../../../components/nimbo/app-layout';

import { SidebarQuota } from './sidebar-quota';
import { useSpace } from './space-provider';

/**
 * Marco de una pantalla de storage sin explorador (017 P-3: la vista previa vive dentro del layout de la app): la
 * navegación con «Mis Archivos» activo y la tarjeta de cuota del resumen compartido (007).
 */
export function StorageAppLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const { state } = useSpace();
  return <AppLayout quotaCard={<SidebarQuota state={state} />}>{children}</AppLayout>;
}
