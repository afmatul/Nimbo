import type { AccessEntry, ReceivedShare } from '@nimbo/contracts';

import type { SharingApi } from './sharing-api';

export const NODE_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
export const SHARE_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
export const OTHER_SHARE_ID = '3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f';
export const PARENT_FOLDER_ID = '4d5e6f7a-8b9c-4d0e-8f1a-3b4c5d6e7f8a';
const GRANTEE_ID = '5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8a9b';
const OTHER_GRANTEE_ID = '6f7a8b9c-0d1e-4f2a-8b3c-5d6e7f8a9b0c';
export const SHARED_AT = '2026-10-28T15:40:00.000Z';

type DirectEntry = Extract<AccessEntry, { origin: 'direct' }>;

/** Acceso directo de Juan como Editor (012 CA-8); `overrides` cambia nivel u otros campos. */
export function directEntry(overrides: Partial<DirectEntry> = {}): DirectEntry {
  return {
    grantee: { id: GRANTEE_ID, displayName: 'Juan Cortés', email: 'juan@nimbo.gt' },
    level: 'EDITOR',
    createdAt: SHARED_AT,
    shareId: SHARE_ID,
    origin: 'direct',
    inheritedFrom: null,
    ...overrides,
  };
}

/** Acceso de Laura heredado de la carpeta «Proyecto Alpha» (RN-4): sin `shareId`. */
export const INHERITED_ENTRY: AccessEntry = {
  grantee: { id: OTHER_GRANTEE_ID, displayName: 'Laura Belmont', email: 'laura@nimbo.gt' },
  level: 'VIEWER',
  createdAt: SHARED_AT,
  shareId: null,
  origin: 'inherited',
  inheritedFrom: { folderId: PARENT_FOLDER_ID, folderName: 'Proyecto Alpha' },
};

/** Un elemento de «Compartidos conmigo» (012 CA-22); por omisión, un `.docx` como Editor. */
export function receivedShare(overrides: Partial<ReceivedShare> = {}): ReceivedShare {
  return {
    shareId: SHARE_ID,
    nodeType: 'file',
    nodeId: NODE_ID,
    name: 'Informe_trimestral_Q3.docx',
    owner: { displayName: 'Andrea Morales' },
    level: 'EDITOR',
    createdAt: SHARED_AT,
    ...overrides,
  };
}

export const RECEIVED_FOLDER = receivedShare({
  shareId: OTHER_SHARE_ID,
  nodeType: 'folder',
  nodeId: PARENT_FOLDER_ID,
  name: 'Contratos 2026',
  owner: { displayName: 'Laura Méndez' },
  level: 'VIEWER',
});

export function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

/** Doble del cliente de `sharing`: por omisión, ninguna llamada responde. */
export function fakeSharingApi(overrides: Partial<SharingApi> = {}): jest.Mocked<SharingApi> {
  return {
    share: jest.fn(() => never()),
    listAccess: jest.fn(() => never()),
    revoke: jest.fn(() => never()),
    listReceived: jest.fn(() => never()),
    leave: jest.fn(() => never()),
    ...overrides,
  } as jest.Mocked<SharingApi>;
}
