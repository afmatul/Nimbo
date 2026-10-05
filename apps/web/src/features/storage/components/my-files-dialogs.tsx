'use client';

import type { NodeSummary } from '@nimbo/contracts';
import type * as React from 'react';

import { folderNamesOf, type MyFilesState } from '../hooks/use-my-files-state';

import { placeNameOf } from './file-explorer';
import { MoveDialog } from './move-dialog';
import { NewFolderDialog } from './new-folder-dialog';
import { RenameDialog } from './rename-dialog';

interface OrganizeDialogProps {
  readonly state: MyFilesState;
  readonly node: NodeSummary;
}

function RenameNodeDialog({ state, node }: OrganizeDialogProps): React.JSX.Element {
  const { api } = state.uploads;
  return (
    <RenameDialog
      node={node}
      siblingFolderNames={folderNamesOf(state.view.levelOf(node).nodes)}
      renameFile={(fileId, body) => api.renameFile(fileId, body)}
      renameFolder={(id, body) => api.renameFolder(id, body)}
      onRenamed={state.organize.remember}
      onClose={() => state.organize.setOrganizing(null)}
    />
  );
}

function MoveNodeDialog({ state, node }: OrganizeDialogProps): React.JSX.Element {
  const { api } = state.uploads;
  return (
    <MoveDialog
      node={node}
      breadcrumbs={state.view.levelOf(node).breadcrumbs}
      folderContents={state.load}
      createFolder={(body) => api.createFolder(body)}
      moveFile={(fileId, body) => api.moveFile(fileId, body)}
      moveFolder={(id, body) => api.moveFolder(id, body)}
      onMoved={state.organize.remember}
      onFolderCreated={state.organize.folderCreatedFromMove}
      onClose={() => state.organize.setOrganizing(null)}
    />
  );
}

/** «Nueva carpeta», «Renombrar» y «Mover a…» de Mis archivos y de cada carpeta (006 CA-1, CA-4, CA-7). */
export function MyFilesDialogs({ state }: { readonly state: MyFilesState }): React.JSX.Element {
  const { organizing } = state.organize;
  return (
    <>
      <NewFolderDialog
        open={state.creating.open}
        onOpenChange={state.creating.setOpen}
        parentId={state.folderId}
        destinationName={placeNameOf(state.folderId, state.view.breadcrumbs)}
        siblingFolderNames={folderNamesOf(state.view.nodes)}
        createFolder={(body) => state.uploads.api.createFolder(body)}
        onCreated={state.contents.addFolder}
      />
      {organizing?.action === 'rename' ? (
        <RenameNodeDialog key={organizing.node.id} state={state} node={organizing.node} />
      ) : null}
      {organizing?.action === 'move' ? (
        <MoveNodeDialog key={organizing.node.id} state={state} node={organizing.node} />
      ) : null}
    </>
  );
}
