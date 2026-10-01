'use client';

import { STORAGE_ERROR_CODES, type DownloadUrlResponse, type FileSummary } from '@nimbo/contracts';
import {
  AlertCircle,
  Download,
  EllipsisVertical,
  FolderInput,
  Loader2,
  Pencil,
  X,
} from 'lucide-react';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { StorageRequestError } from '../storage-request-error';

export interface DownloadNotice {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly onAction: () => void;
}

/** Pasado este tiempo sin URL, el ítem muestra «Preparando…» (RNF-14). */
export const PREPARING_DELAY_MS = 2_000;

export interface FileRowMenuProps {
  readonly file: FileSummary;
  /** `POST /files/:id/download-url`. Un error HTTP llega como `StorageRequestError`; cualquier otro, como red. */
  readonly requestUrl: (fileId: string) => Promise<DownloadUrlResponse>;
  readonly onNotice: (notice: DownloadNotice | null) => void;
  readonly onRefresh: () => void;
  readonly openUrl?: (url: string) => void;
  /** Abre «Renombrar» (006 CA-4). */
  readonly onRename: () => void;
  /** Abre «Mover a…» (006 CA-7). */
  readonly onMove: () => void;
}

const openInBrowser = (url: string): void => window.location.assign(url);

function codeOf(error: unknown): string | null {
  return error instanceof StorageRequestError ? error.code : null;
}

function failureNotice(
  name: string,
  code: string | null,
  retry: () => void,
  refresh: () => void,
): DownloadNotice {
  if (code === STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND) {
    return {
      title: `No encontramos «${name}».`,
      description:
        'Puede que ya no esté en Mis archivos. Actualiza la lista para ver tus archivos.',
      actionLabel: 'Actualizar lista',
      onAction: refresh,
    };
  }
  return {
    title: `No pudimos preparar la descarga de «${name}».`,
    description:
      code === STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS
        ? 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.'
        : 'Revisa tu conexión e inténtalo de nuevo.',
    actionLabel: 'Reintentar',
    onAction: retry,
  };
}

/** Menú ⋮ de una fila con «Descargar»; si la URL tarda más de 2 s, muestra «Preparando…» y lo anuncia. */
export function FileRowMenu({
  file,
  requestUrl,
  onNotice,
  onRefresh,
  openUrl = openInBrowser,
  onRename,
  onMove,
}: FileRowMenuProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);
  const inFlight = React.useRef(false);
  const preparingTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(preparingTimer.current), []);

  const download = async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    onNotice(null);
    preparingTimer.current = setTimeout(() => setPreparing(true), PREPARING_DELAY_MS);
    try {
      const { url } = await requestUrl(file.id);
      openUrl(url);
    } catch (error) {
      onNotice(failureNotice(file.name, codeOf(error), () => void download(), onRefresh));
    } finally {
      clearTimeout(preparingTimer.current);
      inFlight.current = false;
      setPreparing(false);
      setOpen(false);
    }
  };

  const handleSelect = (event: Event): void => {
    event.preventDefault();
    void download();
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <RowMenuTrigger name={file.name} />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            aria-disabled={preparing || undefined}
            className={preparing ? 'text-secondary-foreground' : undefined}
            onSelect={handleSelect}
          >
            {preparing ? (
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Download className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
            )}
            {preparing ? 'Preparando…' : 'Descargar'}
          </DropdownMenuItem>
          <OrganizeMenuItems onRename={onRename} onMove={onMove} />
        </DropdownMenuContent>
      </DropdownMenu>
      <span role="status" aria-live="polite" className="sr-only">
        {preparing ? `Preparando la descarga de ${file.name}…` : ''}
      </span>
    </>
  );
}

/** Botón ⋮ de una fila (mockup `acciones`): «Acciones de {nombre}». */
export function RowMenuTrigger({ name }: { readonly name: string }): React.JSX.Element {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 text-secondary-foreground"
        aria-label={`Acciones de ${name}`}
      >
        <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
  );
}

export interface OrganizeMenuItemsProps {
  readonly onRename: () => void;
  readonly onMove: () => void;
}

/** «Renombrar» y «Mover a…», comunes al menú de archivos y al de carpetas (mockups `acciones-*`). */
export function OrganizeMenuItems({ onRename, onMove }: OrganizeMenuItemsProps): React.JSX.Element {
  return (
    <>
      <DropdownMenuItem onSelect={onRename}>
        <Pencil className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
        Renombrar
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onMove}>
        <FolderInput className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
        Mover a…
      </DropdownMenuItem>
    </>
  );
}

export interface DownloadNoticeBannerProps {
  readonly notice: DownloadNotice;
  readonly onDismiss: () => void;
}

/** Aviso de descarga fallida que va arriba de la lista (no un toast), con la acción correctiva y «Cerrar aviso». */
export function DownloadNoticeBanner({
  notice,
  onDismiss,
}: DownloadNoticeBannerProps): React.JSX.Element {
  return (
    <Alert
      variant="error"
      className="flex flex-wrap items-start gap-3 border-destructive/40 bg-destructive/5 py-3 pl-4 pr-2"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="break-words text-sm font-semibold text-destructive">{notice.title}</p>
        <p className="mt-0.5 text-sm text-foreground">{notice.description}</p>
      </div>
      <div className="flex w-full items-center gap-1 sm:w-auto">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 text-foreground sm:flex-none"
          onClick={notice.onAction}
        >
          {notice.actionLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cerrar aviso"
          onClick={onDismiss}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>
    </Alert>
  );
}
