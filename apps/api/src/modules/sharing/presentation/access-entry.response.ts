import type { AccessEntry } from '@nimbo/contracts';

import type { AccessListEntry } from '../domain/access-list';

/** Una entrada de la lista de accesos como la define el contrato (plan 012 §4, CA-1, CA-8). */
export const toAccessEntry = (entry: AccessListEntry): AccessEntry => {
  const common = {
    grantee: { ...entry.grantee },
    level: entry.level,
    createdAt: entry.createdAt.toISOString(),
  };
  return entry.origin === 'direct'
    ? { ...common, shareId: entry.shareId, origin: 'direct', inheritedFrom: null }
    : {
        ...common,
        shareId: null,
        origin: 'inherited',
        inheritedFrom: { folderId: entry.folder.id, folderName: entry.folder.name },
      };
};
