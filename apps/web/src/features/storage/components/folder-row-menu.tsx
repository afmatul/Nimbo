'use client';

import type { FolderSummary } from '@nimbo/contracts';
import * as React from 'react';

import { DropdownMenu, DropdownMenuContent } from '../../../components/ui/dropdown-menu';

import {
  OrganizeMenuItems,
  PinMenuItem,
  RowMenuTrigger,
  type OrganizeMenuItemsProps,
  type PinToggle,
} from './file-row-menu';
import { MoveToTrashMenuItem } from './move-to-trash-menu-item';

export interface FolderRowMenuProps extends OrganizeMenuItemsProps {
  readonly folder: FolderSummary;
  /** «Mover a la papelera» con todo su contenido, sin confirmación (006 CA-11). */
  readonly onMoveToTrash: () => void;
  readonly pin: PinToggle;
}

/**
 * Menú ⋮ de una carpeta (mockups `acciones-carpeta` y `menu-fila-carpeta`): «Renombrar», «Mover a…», «Fijar en la barra
 * lateral» y «Mover a la papelera».
 */
export function FolderRowMenu({
  folder,
  onRename,
  onMove,
  onMoveToTrash,
  pin,
}: FolderRowMenuProps): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <RowMenuTrigger name={folder.name} />
      <DropdownMenuContent align="end">
        <OrganizeMenuItems onRename={onRename} onMove={onMove} />
        <PinMenuItem pin={pin} />
        <MoveToTrashMenuItem onSelect={onMoveToTrash} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
