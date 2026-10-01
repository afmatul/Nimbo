'use client';

import type { FolderSummary } from '@nimbo/contracts';
import * as React from 'react';

import { DropdownMenu, DropdownMenuContent } from '../../../components/ui/dropdown-menu';

import { OrganizeMenuItems, RowMenuTrigger, type OrganizeMenuItemsProps } from './file-row-menu';
import { MoveToTrashMenuItem } from './move-to-trash-menu-item';

export interface FolderRowMenuProps extends OrganizeMenuItemsProps {
  readonly folder: FolderSummary;
  /** «Mover a la papelera» con todo su contenido, sin confirmación (006 CA-11). */
  readonly onMoveToTrash: () => void;
}

/** Menú ⋮ de una carpeta (mockup `acciones-carpeta`): «Renombrar», «Mover a…» y «Mover a la papelera». */
export function FolderRowMenu({
  folder,
  onRename,
  onMove,
  onMoveToTrash,
}: FolderRowMenuProps): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <RowMenuTrigger name={folder.name} />
      <DropdownMenuContent align="end">
        <OrganizeMenuItems onRename={onRename} onMove={onMove} />
        <MoveToTrashMenuItem onSelect={onMoveToTrash} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
