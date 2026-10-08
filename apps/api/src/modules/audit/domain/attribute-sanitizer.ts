import type { AuditAttributes, AuditAttributeValue } from './audit-entry';

/**
 * Largo máximo de un atributo de texto (motivo de Soporte, D-6). Coincide con `AUDIT_NOTE_MAX_LENGTH` de
 * `contracts/audit` sin importarlo (ADR-0008); `audit-catalog.spec.ts` lo comprueba.
 */
export const AUDIT_NOTE_MAX_LENGTH = 500;

/**
 * Tipo permitido de un atributo: número finito, texto corto, booleano, UUID (id de un recurso, nunca un nombre) o uno
 * de una lista cerrada de textos.
 */
export type AttributeKind = 'number' | 'text' | 'boolean' | 'uuid' | readonly [string, ...string[]];

/** Claves permitidas de una acción y su tipo. Lo que no está aquí no se guarda (lista blanca, CA-4). */
export type AttributeRules = Readonly<Record<string, AttributeKind>>;

export type AttributeRejectionCode =
  'attribute_not_allowed' | 'attribute_not_flat' | 'attribute_too_long';

/** Por qué se descartó un atributo. Lleva la clave, nunca el valor (CA-4, Art. IX). */
export interface AttributeRejection {
  readonly code: AttributeRejectionCode;
  readonly key: string;
}

export interface SanitizedAttributes {
  readonly attributes: AuditAttributes;
  readonly rejections: readonly AttributeRejection[];
}

/**
 * Deja solo los atributos que `rules` permite, planos y del tipo declarado (CA-4). Una clave fuera de la lista (nombre
 * de archivo, URL, token, contraseña, clave de enlace…), un valor no plano o un texto largo se descartan con su motivo.
 */
export function sanitizeAttributes(
  rules: AttributeRules,
  raw: Readonly<Record<string, unknown>> | undefined,
): SanitizedAttributes {
  const kept: [string, AuditAttributeValue][] = [];
  const rejections: AttributeRejection[] = [];
  for (const [key, value] of Object.entries(raw ?? {})) {
    const code = rejectionOf(rules, key, value);
    if (code === null) kept.push([key, value as AuditAttributeValue]);
    else rejections.push({ code, key });
  }
  return Object.freeze({
    attributes: Object.freeze(Object.fromEntries(kept)),
    rejections: Object.freeze(rejections),
  });
}

function rejectionOf(
  rules: AttributeRules,
  key: string,
  value: unknown,
): AttributeRejectionCode | null {
  if (!Object.hasOwn(rules, key)) return 'attribute_not_allowed';
  if (!isFlat(value)) return 'attribute_not_flat';
  const kind = rules[key] as AttributeKind;
  if (!matchesKind(kind, value)) return 'attribute_not_allowed';
  if (typeof value === 'string' && value.length > AUDIT_NOTE_MAX_LENGTH) {
    return 'attribute_too_long';
  }
  return null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isFlat = (value: unknown): value is AuditAttributeValue =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

function matchesKind(kind: AttributeKind, value: AuditAttributeValue): boolean {
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (kind === 'text') return typeof value === 'string';
  if (kind === 'boolean') return typeof value === 'boolean';
  if (kind === 'uuid') return typeof value === 'string' && UUID_PATTERN.test(value);
  return typeof value === 'string' && kind.includes(value);
}
