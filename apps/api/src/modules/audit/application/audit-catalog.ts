import { INTERNAL_ROLES } from '@nimbo/contracts';

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
const ON_ACCOUNT = { resourceType: 'account', attributes: {} } as const;
const ON_PLAN = { resourceType: 'plan', attributes: {} } as const;
const RENEWAL_TRIGGERS = ['manual', 'automatic'] as const;
const ON_SUBSCRIPTION = { resourceType: null, attributes: {} } as const;
const ON_SUBSCRIPTION_PLAN = { resourceType: null, attributes: { planSlug: 'text' } } as const;

/**
 * Catálogo cerrado (RN-3): por acción, su tipo de recurso y la lista blanca de atributos con su tipo. Son las siete
 * acciones de 005 y 006 (D-1) con los atributos que emiten hoy, las dos de versiones de 014 (plan §5; un reemplazo
 * reutiliza `file.upload_completed` con `replaced`, `versionId` y `versionNumber`), las siete internas de 011 (plan
 * §2), que no guardan nombres ni correos, las tres de edición de 016 (plan §5) y las nueve de la suscripción de 010
 * (plan §2, sin datos de tarjeta). Cada spec agrega las suyas. Una acción del enum sin entrada no compila.
 */
export const AUDIT_CATALOG = {
  [AuditAction.FILE_UPLOAD_COMPLETED]: {
    resourceType: 'file',
    attributes: {
      sizeBytes: 'number',
      mode: 'text',
      replaced: 'boolean',
      versionId: 'uuid',
      versionNumber: 'number',
    },
  },
  [AuditAction.FILE_UPLOAD_REJECTED]: {
    resourceType: 'upload',
    attributes: { reason: 'text', mode: 'text', sizeBytes: 'number' },
  },
  [AuditAction.FILE_DOWNLOAD_URL_ISSUED]: {
    resourceType: 'file',
    attributes: { sizeBytes: 'number' },
  },
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
  [AuditAction.FILE_VERSION_RESTORED]: {
    resourceType: 'file',
    attributes: {
      versionId: 'uuid',
      versionNumber: 'number',
      restoredFromNumber: 'number',
      sizeBytes: 'number',
    },
  },
  [AuditAction.FILE_VERSION_PRUNED]: {
    resourceType: 'file',
    attributes: { versionId: 'uuid', versionNumber: 'number', sizeBytes: 'number' },
  },
  [AuditAction.ACCOUNT_SUSPENDED]: ON_ACCOUNT,
  [AuditAction.ACCOUNT_REACTIVATED]: ON_ACCOUNT,
  [AuditAction.ACCOUNT_INTERNAL_CREATED]: {
    resourceType: 'account',
    attributes: { role: INTERNAL_ROLES },
  },
  [AuditAction.ACCOUNT_BOOTSTRAP_ADMIN]: ON_ACCOUNT,
  [AuditAction.CLIENT_FILES_VIEWED]: ON_ACCOUNT,
  [AuditAction.PLAN_CREATED]: ON_PLAN,
  [AuditAction.PLAN_DEACTIVATED]: ON_PLAN,
  [AuditAction.SUBSCRIPTION_AUTO_RENEW_CHANGED]: {
    resourceType: null,
    attributes: { enabled: 'boolean' },
  },
  [AuditAction.SUBSCRIPTION_RENEWED]: {
    resourceType: null,
    attributes: { trigger: RENEWAL_TRIGGERS, planSlug: 'text', amountCents: 'number' },
  },
  [AuditAction.SUBSCRIPTION_RENEWAL_REJECTED]: {
    resourceType: null,
    attributes: { trigger: RENEWAL_TRIGGERS, planSlug: 'text' },
  },
  [AuditAction.SUBSCRIPTION_READ_ONLY_ENTERED]: ON_SUBSCRIPTION,
  [AuditAction.SUBSCRIPTION_READ_ONLY_EXITED]: ON_SUBSCRIPTION,
  [AuditAction.SUBSCRIPTION_PLAN_CHANGE_SCHEDULED]: ON_SUBSCRIPTION_PLAN,
  [AuditAction.SUBSCRIPTION_PLAN_CHANGE_CANCELLED]: ON_SUBSCRIPTION,
  [AuditAction.SUBSCRIPTION_PLAN_CHANGE_APPLIED]: ON_SUBSCRIPTION_PLAN,
  [AuditAction.SUBSCRIPTION_PLAN_CHANGE_DISCARDED]: ON_SUBSCRIPTION_PLAN,
  [AuditAction.FILE_VERSION_CREATED]: {
    resourceType: 'file',
    attributes: {
      versionId: 'uuid',
      versionNumber: 'number',
      sizeBytes: 'number',
      sessionId: 'uuid',
    },
  },
  [AuditAction.EDIT_SESSION_OPENED]: {
    resourceType: 'file',
    attributes: { sessionId: 'uuid' },
  },
  [AuditAction.EDIT_SAVE_FAILED]: {
    resourceType: 'file',
    attributes: { sessionId: 'uuid', reason: 'text' },
  },
} as const satisfies Record<AuditAction, AuditActionSpec>;

/** Tipos que un atributo (`nodeType`) puede dar: solo nodos y cargas. */
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
