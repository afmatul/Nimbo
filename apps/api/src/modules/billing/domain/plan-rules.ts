import type { FieldIssue } from '../../../shared/domain/errors';

import type { PlanLimitsSet } from './plan-limits-set.vo';

/** Máximo por archivo de cualquier plan: 2 GB (RNF-02; CHECK `ck_plan_max_archivo`). */
export const MAX_FILE_BYTES_CEILING = 2_147_483_648n;

/** Lo que un plan nuevo declara; el `slug` lo deriva el servidor (spec 011 CA-9, RN-4). */
export interface PlanTerms {
  readonly name: string;
  readonly priceCents: number;
  readonly limits: PlanLimitsSet;
}

const issue = (field: string, reason: string, message: string): FieldIssue => ({
  field,
  reason,
  message,
});

const required = (field: string): FieldIssue =>
  issue(field, 'REQUIRED', 'Escribe un nombre para el plan.');
const negative = (field: string): FieldIssue =>
  issue(field, 'NEGATIVE', 'Usa un valor igual o mayor que cero.');
const notPositive = (field: string): FieldIssue =>
  issue(field, 'NOT_POSITIVE', 'Usa un valor mayor que cero.');

const positiveLimitIssues = (limits: PlanLimitsSet): FieldIssue[] => [
  ...(limits.quotaBytes > 0n ? [] : [notPositive('quotaBytes')]),
  ...(limits.maxFileBytes > 0n ? [] : [notPositive('maxFileBytes')]),
  ...(limits.maxEditors >= 0 ? [] : [negative('maxEditors')]),
  ...(limits.agentQueriesPerMonth > 0 ? [] : [notPositive('agentQueriesPerMonth')]),
  ...(limits.retainedVersions > 0 ? [] : [notPositive('retainedVersions')]),
  ...(limits.trashRetentionDays > 0 ? [] : [notPositive('trashRetentionDays')]),
];

/** RNF-02: el máximo por archivo no supera la cuota ni 2 GB (solo si ambos son positivos; si no, ya hay un aviso). */
const maxFileIssues = ({ quotaBytes, maxFileBytes }: PlanLimitsSet): FieldIssue[] => {
  if (quotaBytes <= 0n || maxFileBytes <= 0n) return [];
  if (maxFileBytes > MAX_FILE_BYTES_CEILING) {
    return [
      issue('maxFileBytes', 'EXCEEDS_CEILING', 'El máximo por archivo no puede superar 2 GB.'),
    ];
  }
  if (maxFileBytes > quotaBytes) {
    return [
      issue('maxFileBytes', 'EXCEEDS_QUOTA', 'El máximo por archivo no puede superar la cuota.'),
    ];
  }
  return [];
};

/**
 * Reglas de un plan nuevo (spec 011 CA-11): nombre no vacío, precio no negativo, límites positivos (editores admite 0) y
 * máximo por archivo ≤ cuota y ≤ 2 GB. Devuelve todos los campos que fallan, en el orden del formulario. El nombre
 * repetido lo detecta la base (`uq_plan_nombre`).
 */
export const planTermIssues = (terms: PlanTerms): FieldIssue[] => [
  ...(terms.name.trim() === '' ? [required('name')] : []),
  ...(terms.priceCents >= 0 ? [] : [negative('priceCents')]),
  ...positiveLimitIssues(terms.limits),
  ...maxFileIssues(terms.limits),
];
