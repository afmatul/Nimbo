'use client';

import { formatBytes, type FileDetailResponse } from '@nimbo/contracts';
import { ChevronLeft, Download, FilePen } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { FileTypeChip } from '../../../components/nimbo/file-type-chip';
import { Button, buttonVariants } from '../../../components/ui/button';
import { editorPath } from '../../editing/routes';
import { LEVEL_LABELS, SHARED_WITH_ME_LABEL, SHARED_WITH_ME_PATH } from '../../sharing';
import type { StorageApi } from '../api';
import { canEditDocx } from '../node-access';

import {
  DownloadNoticeBanner,
  downloadFailureNotice,
  PREPARING_DELAY_MS,
  type DownloadNotice,
} from './file-row-menu';
import { CHIP_TYPE_BY_KIND } from './node-rows';

export interface SharedFileDetailProps {
  readonly detail: FileDetailResponse;
  readonly api: Pick<StorageApi, 'downloadUrl'>;
  readonly openUrl: (url: string) => void;
}

/** «Descargar» de la versión actual (012 CA-12): «Preparando…» pasados 2 s y el aviso por `code` si falla. */
function useSharedDownload({ detail, api, openUrl }: SharedFileDetailProps) {
  const [preparing, setPreparing] = React.useState(false);
  const [notice, setNotice] = React.useState<DownloadNotice | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const download = async (): Promise<void> => {
    setNotice(null);
    timer.current = setTimeout(() => setPreparing(true), PREPARING_DELAY_MS);
    try {
      openUrl((await api.downloadUrl(detail.file.id)).url);
    } catch (error) {
      const actions = {
        retry: () => void download(),
        refresh: () => window.location.assign(SHARED_WITH_ME_PATH),
      };
      setNotice(downloadFailureNotice(detail.file.name, error, actions));
    } finally {
      clearTimeout(timer.current);
      setPreparing(false);
    }
  };
  return { preparing, notice, download, dismiss: () => setNotice(null) };
}

function SharedFileActions(props: SharedFileDetailProps): React.JSX.Element {
  const { file, accessLevel } = props.detail;
  const { preparing, notice, download, dismiss } = useSharedDownload(props);
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        {file.kind === 'docx' && canEditDocx(accessLevel) ? (
          <Link href={editorPath(file.id)} className={buttonVariants({ variant: 'outline' })}>
            <FilePen className="h-4 w-4" aria-hidden="true" />
            Editar
          </Link>
        ) : null}
        <Button type="button" loading={preparing} onClick={() => void download()}>
          {preparing ? null : <Download className="h-4 w-4" aria-hidden="true" />}
          {preparing ? 'Preparando…' : 'Descargar'}
        </Button>
      </div>
      {notice ? <DownloadNoticeBanner notice={notice} onDismiss={dismiss} /> : null}
    </>
  );
}

/**
 * Ficha de un archivo compartido conmigo (spec 012b CA-9, CA-6): nombre, tipo, tamaño y nivel; «Descargar» y, como
 * Editor de un `.docx`, «Editar». Sin historial, «Compartir» ni escrituras: son del propietario (012 CA-14).
 */
export function SharedFileDetail(props: SharedFileDetailProps): React.JSX.Element {
  const { file, accessLevel } = props.detail;
  const level = LEVEL_LABELS[accessLevel === 'EDITOR' ? 'EDITOR' : 'VIEWER'];
  return (
    <div className="space-y-4">
      <Link
        href={SHARED_WITH_ME_PATH}
        className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-secondary-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-6"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {SHARED_WITH_ME_LABEL}
      </Link>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <FileTypeChip fileType={CHIP_TYPE_BY_KIND[file.kind]} className="mt-1 shrink-0" />
          <div className="min-w-0">
            <h1 className="wrap-anywhere text-xl font-semibold tracking-tight text-foreground">
              {file.name}
            </h1>
            <p className="text-sm tabular-nums text-secondary-foreground">
              {`${formatBytes(file.sizeBytes)} · Tu nivel: ${level}`}
            </p>
          </div>
        </div>
      </header>
      <SharedFileActions {...props} />
    </div>
  );
}
