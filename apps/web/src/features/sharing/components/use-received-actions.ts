'use client';

import type { DownloadUrlResponse, ReceivedShare } from '@nimbo/contracts';
import * as React from 'react';

import { showNotice } from '../../../components/ui/sonner';
import { downloadFailureNotice, type DownloadNotice } from '../../storage/components/file-row-menu';
import type { ReceivedSharesState } from '../hooks/use-received-shares';
import { shareMessageOf } from '../share-messages';

export interface ReceivedActionsContext {
  readonly received: ReceivedSharesState;
  readonly requestUrl: (fileId: string) => Promise<DownloadUrlResponse>;
  readonly openUrl: (url: string) => void;
  /** Tras salir bien, la fila ya no existe: el foco va al título (mockup, decisión 7). */
  readonly focusTitle: () => void;
}

export interface ReceivedActions {
  /** Elemento con «Salir» abierto; `null` = cerrado. */
  readonly leaving: ReceivedShare | null;
  readonly setLeaving: (share: ReceivedShare | null) => void;
  readonly confirmLeave: () => Promise<void>;
  readonly notice: DownloadNotice | null;
  readonly setNotice: (notice: DownloadNotice | null) => void;
  readonly download: (share: ReceivedShare) => Promise<void>;
}

/** Aviso arriba de la lista: un acceso que ya no existe (CA-11) o una descarga fallida (012 CA-12). */
function goneNotice(share: ReceivedShare, refresh: () => void): DownloadNotice {
  return {
    title: 'Ese acceso ya no existe.',
    description: `Es posible que quien compartió «${share.name}» lo haya quitado. Actualiza la lista para ver tus accesos vigentes.`,
    actionLabel: 'Actualizar lista',
    onAction: refresh,
  };
}

interface DownloadContext extends Pick<ReceivedActionsContext, 'requestUrl' | 'openUrl'> {
  readonly setNotice: (notice: DownloadNotice | null) => void;
  readonly refresh: () => void;
}

/** «Descargar» un archivo recibido (012 CA-12); si falla, el aviso de 005 con «Reintentar» o «Actualizar lista». */
function receivedDownloader(context: DownloadContext): (share: ReceivedShare) => Promise<void> {
  const { requestUrl, openUrl, setNotice, refresh } = context;
  const download = async (share: ReceivedShare): Promise<void> => {
    setNotice(null);
    try {
      openUrl((await requestUrl(share.nodeId)).url);
    } catch (error) {
      const retry = (): void => void download(share);
      setNotice(downloadFailureNotice(share.name, error, { retry, refresh }));
    }
  };
  return download;
}

/**
 * «Descargar» y «Salir» de «Compartidos conmigo» (spec 012b CA-9 a CA-11). Salir de un acceso que ya no existe cierra
 * el diálogo sin tocar la lista y avisa con «Actualizar lista»; al salir bien, el aviso y el foco van al título.
 */
export function useReceivedActions(context: ReceivedActionsContext): ReceivedActions {
  const { received, requestUrl, openUrl } = context;
  const [leaving, setLeaving] = React.useState<ReceivedShare | null>(null);
  const [notice, setNotice] = React.useState<DownloadNotice | null>(null);
  const refresh = (): void => {
    setNotice(null);
    received.reload();
  };

  const confirmLeave = async (): Promise<void> => {
    if (leaving === null) return;
    try {
      await received.leave(leaving.shareId);
    } catch (error) {
      if (shareMessageOf(error).fix !== 'refresh') throw error;
      setNotice(goneNotice(leaving, refresh));
      return;
    }
    showNotice(`Saliste de «${leaving.name}».`);
    context.focusTitle();
  };

  const download = receivedDownloader({ requestUrl, openUrl, setNotice, refresh });
  return { leaving, setLeaving, confirmLeave, notice, setNotice, download };
}
