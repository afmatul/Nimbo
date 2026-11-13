'use client';

import type { ReceivedShare } from '@nimbo/contracts';
import { Download, ExternalLink, FilePen, LogOut } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../../components/ui/dropdown-menu';
import { editorPath } from '../../editing/routes';
import { RowMenuTrigger } from '../../storage/components/file-row-menu';
import { receivedFileType } from '../received-file-type';

import { openPathOf } from './received-share-row';

export interface ReceivedShareMenuProps {
  readonly share: ReceivedShare;
  readonly onDownload: () => void;
  readonly onLeave: () => void;
}

const ICON_CLASS = 'h-4 w-4 text-secondary-foreground';

/** Editar en línea: solo un `.docx` compartido como Editor (016 CA-1; 012 CA-14: el Lector abre y descarga). */
const isEditableDocx = (share: ReceivedShare): boolean =>
  share.nodeType === 'file' && share.level === 'EDITOR' && receivedFileType(share.name) === 'docx';

/**
 * Menú ⋮ de un elemento recibido (mockup `menu-fila`, CA-6, CA-9): «Abrir», «Editar» (`.docx` como Editor),
 * «Descargar» (archivos) y «Salir», que no es destructivo. Nunca «Compartir», «Accesos» ni escrituras: son del propietario.
 */
export function ReceivedShareMenu({
  share,
  onDownload,
  onLeave,
}: ReceivedShareMenuProps): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <RowMenuTrigger name={share.name} />
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={openPathOf(share)}>
            <ExternalLink className={ICON_CLASS} aria-hidden="true" />
            Abrir
          </Link>
        </DropdownMenuItem>
        {isEditableDocx(share) ? (
          <DropdownMenuItem asChild>
            <Link href={editorPath(share.nodeId)}>
              <FilePen className={ICON_CLASS} aria-hidden="true" />
              Editar
            </Link>
          </DropdownMenuItem>
        ) : null}
        {share.nodeType === 'file' ? (
          <DropdownMenuItem onSelect={onDownload}>
            <Download className={ICON_CLASS} aria-hidden="true" />
            Descargar
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onLeave}>
          <LogOut className={ICON_CLASS} aria-hidden="true" />
          Salir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
