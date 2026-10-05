import type { AttributeRules } from '../domain/attribute-sanitizer';
import type { AuditAttributes, AuditResourceType } from '../domain/audit-entry';

import { AuditAction } from './audit-action';

/** El tipo de recurso sale del valor de un atributo (`nodeType` en la papelera, que opera sobre archivo o carpeta). */
interface ResourceTypeFromAttribute {
  readonly fromAttribute: string;
}

type ResourceTypeRule = AuditResourceType | ResourceTypeFromAttribute | null;

/** Qué recurso afecta una acción y qué atributos se le guardan (RN-3). */
export interface AuditActionSpec {
  readonly resourceType: ResourceTypeRule;
  readonly attributes: AttributeRules;
}

const fromAttribute = (key: string): ResourceTypeFromAttribute => ({ fromAttribute: key });

const NODE_TYPES = ['file', 'folder'] as const;
const NODE_ATTRIBUTES = { nodeType: NODE_TYPES, itemCount: 'number', sizeBytes: 'number' } as const;

/**
 * Catálogo cerrado (RN-3): por acción, su tipo de recurso y la lista blanca de atributos con su tipo. Son las siete
 * acciones de 005 y 006 (D-1) con los atributos que emiten hoy; cada spec agrega las suyas. Una acción del enum sin
 * entrada no compila.
 */
export const AUDIT_CATALOG = {
  [AuditAction.FILE_UPLOAD_COMPLETED]: {
    resourceType: 'file',
    attributes: { sizeBytes: 'number', mode: 'text' },
  },
  [AuditAction.FILE_UPLOAD_REJECTED]: {
    resourceType: 'upload',
    attributes: { reason: 'text', mode: 'text' },
  },
  [AuditAction.FILE_DOWNLOAD_URL_ISSUED]: { resourceType: 'file', attributes: {} },
  [AuditAction.NODE_TRASHED]: {
    resourceType: fromAttribute('nodeType'),
    attributes: NODE_ATTRIBUTES,
  },
  [AuditAction.NODE_RESTORED]: {
    resourceType: fromAttribute('nodeType'),
    attributes: NODE_ATTRIBUTES,
  },
  [AuditAction.NODE_PURGED]: {
    resourceType: fromAttribute('nodeType'),
    attributes: { ...NODE_ATTRIBUTES, trigger: 'text' },
  },
  [AuditAction.TRASH_EMPTIED]: {
    resourceType: null,
    attributes: { itemCount: 'number', sizeBytes: 'number' },
  },
} as const satisfies Record<AuditAction, AuditActionSpec>;

const RESOURCE_TYPES: ReadonlySet<unknown> = new Set<AuditResourceType>([
  'file',
  'folder',
  'upload',
]);

const isResourceType = (value: unknown): value is AuditResourceType => RESOURCE_TYPES.has(value);

/** Tipo del recurso de un evento (D-3); `null` si la acción no tiene recurso o su atributo no trae un tipo válido. */
export function resourceTypeOf(
  action: AuditAction,
  attributes: AuditAttributes,
): AuditResourceType | null {
  const rule: ResourceTypeRule = AUDIT_CATALOG[action].resourceType;
  if (rule === null || typeof rule === 'string') return rule;
  const value = attributes[rule.fromAttribute];
  return isResourceType(value) ? value : null;
}
