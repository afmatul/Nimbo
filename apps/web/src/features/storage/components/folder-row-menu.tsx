'use client';

import type { FolderSummary } from '@nimbo/contracts';
import * as React from 'react';

import { DropdownMenu, DropdownMenuContent } from '../../../components/ui/dropdown-menu';
import { isOwner, type RowSharing } from '../node-access';

import {
  OrganizeMenuItems,
  PinMenuItem,
  RowMenuTrigger,
  ShareMenuItem,
  type OrganizeMenuItemsProps,
  type PinToggle,
} from './file-row-menu';
import { MoveToTrashMenuItem } from './move-to-trash-menu-item';

export interface FolderRowMenuProps extends OrganizeMenuItemsProps {
  readonly folder: FolderSummary;
  /** «Mover a la papelera» con todo su contenido, sin confirmación (006 CA-11). */
  readonly onMoveToTrash: () => void;
  readonly pin: PinToggle;
  /** Sin `OWNER` la carpeta no tiene acciones: se abre desde su nombre (012b CA-6). */
  readonly sharing: RowSharing;
}

/**
 * Menú ⋮ de una carpeta propia (mockups `acciones-carpeta` y `menu-fila-carpeta`): «Renombrar», «Mover a…», «Fijar en
 * la barra lateral», «Compartir» y «Mover a la papelera».
 */
export function FolderRowMenu({
  folder,
  onRename,
  onMove,
  onMoveToTrash,
  pin,
  sharing,
}: FolderRowMenuProps): React.JSX.Element | null {
  if (!isOwner(sharing.level)) return null;
  return (
    <DropdownMenu modal={false}>
      <RowMenuTrigger name={folder.name} />
      <DropdownMenuContent align="end">
        <OrganizeMenuItems onRename={onRename} onMove={onMove} />
        <PinMenuItem pin={pin} />
        <ShareMenuItem onShare={sharing.onShare} />
        <MoveToTrashMenuItem onSelect={onMoveToTrash} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
