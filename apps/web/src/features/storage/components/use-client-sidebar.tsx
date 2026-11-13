'use client';

import * as React from 'react';

import type { AppLayoutProps } from '../../../components/nimbo/app-layout';
import { useTrashCount } from '../hooks/use-trash-count';
import { useUploads } from '../hooks/use-upload-manager';

import { DownloadNoticeBanner, type DownloadNotice } from './file-row-menu';
import { useQuickAccessSidebar } from './quick-access-sidebar';

export type ClientSidebar = Pick<AppLayoutProps, 'sidebarSection' | 'trashCount'> & {
  /** Aviso de un fijado o quitado fallido en los accesos rápidos; va arriba del contenido de la página. */
  readonly banner: React.ReactNode;
};

/**
 * Lo que la barra lateral del Cliente lleva en toda pantalla que no maneja sus propios accesos rápidos (Buscar,
 * Compartidos, Espacio): los «Accesos rápidos» y el contador de la Papelera. Las pantallas de archivos arman los suyos.
 */
export function useClientSidebar(): ClientSidebar {
  const { api } = useUploads();
  const [notice, setNotice] = React.useState<DownloadNotice | null>(null);
  const sidebar = useQuickAccessSidebar({ api, openedFolderId: null, onNotice: setNotice });
  const trash = useTrashCount(api);
  return {
    sidebarSection: sidebar.sidebarSection,
    trashCount: trash.count,
    banner: notice ? (
      <DownloadNoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
    ) : null,
  };
}
