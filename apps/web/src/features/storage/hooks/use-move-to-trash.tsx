'use client';

import { STORAGE_ERROR_CODES, type NodeSummary } from '@nimbo/contracts';
import Link from 'next/link';
import * as React from 'react';

import { buttonVariants } from '../../../components/ui/button';
import { showNotice } from '../../../components/ui/sonner';
import type { DownloadNotice } from '../components/file-row-menu';
import { TRASH_PATH } from '../routes';
import { StorageRequestError } from '../storage-request-error';
import type { TrashApi } from '../trash-api';

export interface UseMoveToTrashOptions {
  readonly api: Pick<TrashApi, 'moveToTrash'>;
  /** Tras mover: p. ej. volver a leer el contador de la Papelera. */
  readonly onMoved: () => void;
  /** Aviso de falla arriba de la lista (el mismo lugar que el de descarga, mockup `eliminar-fallido`). */
  readonly onNotice: (notice: DownloadNotice | null) => void;
  readonly onRefresh: () => void;
}

function failureNotice(
  node: NodeSummary,
  error: unknown,
  retry: () => void,
  refresh: () => void,
): DownloadNotice {
  if (
    error instanceof StorageRequestError &&
    error.code === STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND
  ) {
    return {
      title: `No encontramos «${node.name}».`,
      description:
        'Puede que ya no esté en Mis archivos. Actualiza la lista para ver tus archivos.',
      actionLabel: 'Actualizar lista',
      onAction: refresh,
    };
  }
  const stays =
    node.type === 'folder'
      ? 'La carpeta sigue en este lugar.'
      : 'El archivo sigue en esta carpeta.';
  return {
    title: `No pudimos mover «${node.name}» a la papelera.`,
    description: `Revisa tu conexión e inténtalo de nuevo. ${stays}`,
    actionLabel: 'Reintentar',
    onAction: retry,
  };
}

/**
 * «Mover a la papelera» desde el explorador (CA-10, CA-11): sin confirmación, saca el elemento de la vista y avisa
 * «Movimos…» con «Ver papelera» (un enlace: navegar dentro de la pestaña conserva las cargas).
 */
export function useMoveToTrash({ api, onMoved, onNotice, onRefresh }: UseMoveToTrashOptions): {
  readonly trashedIds: ReadonlySet<string>;
  readonly moveToTrash: (node: NodeSummary) => Promise<void>;
} {
  const [trashedIds, setTrashedIds] = React.useState<ReadonlySet<string>>(new Set());

  const moveToTrash = React.useCallback(
    (node: NodeSummary): Promise<void> => {
      const attempt = async (): Promise<void> => {
        onNotice(null);
        try {
          await api.moveToTrash(node.type, node.id);
        } catch (error) {
          onNotice(failureNotice(node, error, () => void attempt(), onRefresh));
          return;
        }
        setTrashedIds((previous) => new Set([...previous, node.id]));
        showNotice(`Movimos «${node.name}» a la papelera.`, {
          action: (
            <Link href={TRASH_PATH} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Ver papelera
            </Link>
          ),
        });
        onMoved();
      };
      return attempt();
    },
    [api, onMoved, onNotice, onRefresh],
  );

  return { trashedIds, moveToTrash };
}
