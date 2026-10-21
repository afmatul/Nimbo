'use client';

import { STORAGE_ERROR_CODES, type DownloadUrlResponse, type FileSummary } from '@nimbo/contracts';
import {
  AlertCircle,
  Download,
  EllipsisVertical,
  FilePen,
  FolderInput,
  History,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  X,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { editorPath } from '../../editing/routes';
import { fileDetailPath } from '../routes';
import { StorageRequestError } from '../storage-request-error';

import { MoveToTrashMenuItem } from './move-to-trash-menu-item';

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
  /** «Mover a la papelera», sin confirmación (006 CA-10). */
  readonly onMoveToTrash: () => void;
  readonly pin: PinToggle;
  /**
   * Primer ítem del menú, antes de «Descargar» (017: «Previsualizar»), ya renderizado: `MyFiles` lo crea desde su
   * `FirstFileAction`. Storage no conoce quién lo provee.
   */
  readonly firstAction?: React.ReactNode;
}

/** Abre la URL firmada en la pestaña: el navegador descarga (005 CA-13). */
export const openInBrowser = (url: string): void => window.location.assign(url);

function codeOf(error: unknown): string | null {
  return error instanceof StorageRequestError ? error.code : null;
}

/** Qué hacer tras una petición fallida que se puede repetir: esperar ante un `429`; si no, revisar la conexión. */
export function retryAdvice(error: unknown): string {
  return codeOf(error) === STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS
    ? 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.'
    : 'Revisa tu conexión e inténtalo de nuevo.';
}

/** Acciones del aviso de descarga fallida: «Reintentar» o, si ya no existe, «Actualizar lista». */
export interface DownloadFailureActions {
  readonly retry: () => void;
  readonly refresh: () => void;
}

/** Aviso de una descarga fallida (005 CA-21), desde la fila o desde la barra lateral (006 CA-27). */
export function downloadFailureNotice(
  name: string,
  error: unknown,
  { retry, refresh }: DownloadFailureActions,
): DownloadNotice {
  const code = codeOf(error);
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
    description: retryAdvice(error),
    actionLabel: 'Reintentar',
    onAction: retry,
  };
}

/**
 * Menú ⋮ de una fila con «Descargar» (si la URL tarda más de 2 s, muestra «Preparando…» y lo anuncia) y «Ver historial»,
 * que abre la ficha del archivo (014 CA-20).
 */
export function FileRowMenu({
  file,
  requestUrl,
  onNotice,
  onRefresh,
  openUrl = openInBrowser,
  onRename,
  onMove,
  onMoveToTrash,
  pin,
  firstAction,
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
      onNotice(
        downloadFailureNotice(file.name, error, {
          retry: () => void download(),
          refresh: onRefresh,
        }),
      );
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
          {firstAction}
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
          <HistoryMenuItem fileId={file.id} />
          <OrganizeMenuItems onRename={onRename} onMove={onMove} />
          <PinMenuItem pin={pin} />
          {file.kind === 'docx' ? <EditMenuItem fileId={file.id} /> : null}
          <MoveToTrashMenuItem onSelect={onMoveToTrash} />
        </DropdownMenuContent>
      </DropdownMenu>
      <span role="status" aria-live="polite" className="sr-only">
        {preparing ? `Preparando la descarga de ${file.name}…` : ''}
      </span>
    </>
  );
}

/** El botón ⋮ es el control de su fila: lo enfoca la vuelta de la vista previa (017 §6). */
export const ROW_CONTROL_SELECTOR = '[data-row-control]';

/** «Ver historial»: enlace a la ficha del archivo con sus versiones (plan 014 §2). */
function HistoryMenuItem({ fileId }: { readonly fileId: string }): React.JSX.Element {
  return (
    <DropdownMenuItem asChild>
      <Link href={fileDetailPath(fileId)}>
        <History className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
        Ver historial
      </Link>
    </DropdownMenuItem>
  );
}

/** «Editar»: solo para `.docx`, el único formato que se edita en línea (016 CA-1, CA-4; ADR-0004). */
function EditMenuItem({ fileId }: { readonly fileId: string }): React.JSX.Element {
  return (
    <DropdownMenuItem asChild>
      <Link href={editorPath(fileId)}>
        <FilePen className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
        Editar
      </Link>
    </DropdownMenuItem>
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
        data-row-control=""
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

/** Estado «fijado» (de `GET /quick-access`) y la acción de fijar o quitar (006 CA-27). */
export interface PinToggle {
  readonly pinned: boolean;
  readonly onToggle: () => void;
}

/**
 * «Fijar en la barra lateral» o, si ya está fijado, «Quitar de la barra lateral» (mockups `menu-fila-*`). No se
 * deshabilita en el tope: intentar el sexto muestra el aviso (CA-28).
 */
export function PinMenuItem({ pin }: { readonly pin: PinToggle }): React.JSX.Element {
  const Icon = pin.pinned ? PinOff : Pin;
  return (
    <DropdownMenuItem onSelect={pin.onToggle}>
      <Icon className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
      {pin.pinned ? 'Quitar de la barra lateral' : 'Fijar en la barra lateral'}
    </DropdownMenuItem>
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
