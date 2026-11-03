import type { ShareLevel } from '@nimbo/contracts';

/** Nivel en texto (el color nunca lo distingue, ui-guidelines §1). */
export const LEVEL_LABELS: Readonly<Record<ShareLevel, string>> = {
  VIEWER: 'Lector',
  EDITOR: 'Editor',
};
