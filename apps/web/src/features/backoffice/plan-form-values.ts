import type { CreatePlanRequest } from '@nimbo/contracts';

/**
 * Lo que se escribe en el formulario de un plan nuevo (011 CA-9; mockup `backoffice/catalogo`, decisión 9): todo como
 * texto, con su unidad al lado. Los bytes y los centavos los arma la API; aquí solo se traducen las unidades.
 */

/** Unidad del almacenamiento del plan. */
export type QuotaUnit = 'GB' | 'TB';

/** Unidad del máximo por archivo. */
export type MaxFileUnit = 'MB' | 'GB';

export interface PlanFormValues {
  readonly name: string;
  readonly description: string;
  /** Precio al mes en quetzales, con centavos («125.00»). */
  readonly price: string;
  /** Almacenamiento del plan, sin su unidad. */
  readonly quota: string;
  readonly quotaUnit: QuotaUnit;
  /** Máximo por archivo, sin su unidad. */
  readonly maxFile: string;
  readonly maxFileUnit: MaxFileUnit;
  readonly maxEditors: string;
  readonly agentQueries: string;
  readonly retainedVersions: string;
  readonly trashRetentionDays: string;
}

export const PLAN_FORM_DEFAULTS: PlanFormValues = {
  name: '',
  description: '',
  price: '',
  quota: '',
  quotaUnit: 'GB',
  maxFile: '',
  maxFileUnit: 'GB',
  maxEditors: '',
  agentQueries: '',
  retainedVersions: '',
  trashRetentionDays: '',
};

/** Los bytes de una unidad (base 1024, la del catálogo de la 006a: «15 GB» para el Personal). */
const BYTES_PER_UNIT: Readonly<Record<QuotaUnit | MaxFileUnit, number>> = {
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
};

/** El número escrito, o `null` si no es un entero (el campo lo avisa). */
export function integerOf(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** «500» + GB → «536870912000»: los bytes van como texto decimal (ADR-0016). */
export function bytesOf(value: string, unit: QuotaUnit | MaxFileUnit): string | null {
  const amount = integerOf(value);
  if (amount === null) return null;
  return String(amount * BYTES_PER_UNIT[unit]);
}

/** «125.00» → 12500 centavos; un precio negativo o con letras no se traduce. */
export function centsOf(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, decimals = ''] = trimmed.split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}

/**
 * El cuerpo que pide la API (011 CA-9). Lo que no se puede traducir (un número con letras) queda en `null`: el
 * formulario lo avisa antes de enviar, y la API vuelve a validar (CA-11).
 */
export function toPlanRequest(values: PlanFormValues): CreatePlanRequest | null {
  const quotaBytes = bytesOf(values.quota, values.quotaUnit);
  const maxFileBytes = bytesOf(values.maxFile, values.maxFileUnit);
  const priceCents = centsOf(values.price);
  const maxEditors = integerOf(values.maxEditors);
  const agentQueries = integerOf(values.agentQueries);
  const retainedVersions = integerOf(values.retainedVersions);
  const trashRetentionDays = integerOf(values.trashRetentionDays);
  if (
    quotaBytes === null ||
    maxFileBytes === null ||
    priceCents === null ||
    maxEditors === null ||
    agentQueries === null ||
    retainedVersions === null ||
    trashRetentionDays === null
  ) {
    return null;
  }
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    priceCents,
    quotaBytes,
    maxFileBytes,
    maxEditors,
    agentQueriesPerMonth: agentQueries,
    retainedVersions,
    trashRetentionDays,
  };
}
