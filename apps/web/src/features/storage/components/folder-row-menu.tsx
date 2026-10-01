'use client';

import type { FolderSummary } from '@nimbo/contracts';
import * as React from 'react';

import { DropdownMenu, DropdownMenuContent } from '../../../components/ui/dropdown-menu';

import { OrganizeMenuItems, RowMenuTrigger, type OrganizeMenuItemsProps } from './file-row-menu';

export interface FolderRowMenuProps extends OrganizeMenuItemsProps {
  readonly folder: FolderSummary;
}

/** Menú ⋮ de una carpeta (mockup `acciones-carpeta`): «Renombrar» y «Mover a…». */
export function FolderRowMenu({ folder, onRename, onMove }: FolderRowMenuProps): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <RowMenuTrigger name={folder.name} />
      <DropdownMenuContent align="end">
        <OrganizeMenuItems onRename={onRename} onMove={onMove} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
