import type { CreatePlanRequest } from '@nimbo/contracts';

/**
 * Lo que se escribe en el formulario de un plan nuevo (011 CA-9; mockup `backoffice/catalogo`, decisión 9): todo como
 * texto, con su unidad al lado. Los bytes y los centavos los arma la API; aquí solo se traducen las unidades.
 */

/** Los campos del formulario (011 T-11). */
export const PLAN_FIELDS = [
  'name',
  'description',
  'price',
  'quota',
  'maxFile',
  'maxEditors',
  'agentQueries',
  'retainedVersions',
  'trashRetentionDays',
] as const;

export type PlanField = (typeof PLAN_FIELDS)[number];

/** Unidad del almacenamiento del plan. */
export type QuotaUnit = 'GB' | 'TB';

/** Unidad del máximo por archivo. */
export type MaxFileUnit = 'MB' | 'GB';

export const QUOTA_UNITS: readonly [QuotaUnit, ...QuotaUnit[]] = ['GB', 'TB'];
export const MAX_FILE_UNITS: readonly [MaxFileUnit, ...MaxFileUnit[]] = ['MB', 'GB'];

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

/**
 * «125.00» o «125,00» → 12500 centavos. La coma es el separador decimal de la UI (PD-91) y el punto también vale;
 * con tres decimales o con los dos separadores a la vez no se sabe qué es, así que no se traduce (el campo lo avisa).
 */
export function centsOf(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimals = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}

/** Un valor traducido, o los campos que no se pudieron traducir. */
type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly invalid: readonly PlanField[] };

/** El cuerpo que pide la API, o los campos que no se pudieron traducir. */
export type PlanFormParse =
  { readonly request: CreatePlanRequest } | { readonly invalid: readonly PlanField[] };

/** El nombre y la descripción del plan: si falta alguno, no hay cuerpo que enviar. */
function parseText(values: PlanFormValues): Parsed<{ name: string; description: string }> {
  const name = values.name.trim();
  const description = values.description.trim();
  const invalid: PlanField[] = [];
  if (name === '') invalid.push('name');
  if (description === '') invalid.push('description');
  return invalid.length > 0 ? { ok: false, invalid } : { ok: true, value: { name, description } };
}

/** El precio y los dos tamaños: los que se traducen a centavos y a bytes. */
function parseMoneyAndSize(
  values: PlanFormValues,
): Parsed<{ priceCents: number; quotaBytes: string; maxFileBytes: string }> {
  const priceCents = centsOf(values.price);
  const quotaBytes = bytesOf(values.quota, values.quotaUnit);
  const maxFileBytes = bytesOf(values.maxFile, values.maxFileUnit);
  if (priceCents === null || quotaBytes === null || maxFileBytes === null) {
    const invalid: PlanField[] = [];
    if (priceCents === null) invalid.push('price');
    if (quotaBytes === null) invalid.push('quota');
    if (maxFileBytes === null) invalid.push('maxFile');
    return { ok: false, invalid };
  }
  return { ok: true, value: { priceCents, quotaBytes, maxFileBytes } };
}

/** Los cuatro números que se cuentan tal cual. */
function parseCounts(values: PlanFormValues): Parsed<{
  maxEditors: number;
  agentQueriesPerMonth: number;
  retainedVersions: number;
  trashRetentionDays: number;
}> {
  const maxEditors = integerOf(values.maxEditors);
  const agentQueries = integerOf(values.agentQueries);
  const retainedVersions = integerOf(values.retainedVersions);
  const trashRetentionDays = integerOf(values.trashRetentionDays);
  if (
    maxEditors === null ||
    agentQueries === null ||
    retainedVersions === null ||
    trashRetentionDays === null
  ) {
    const invalid: PlanField[] = [];
    if (maxEditors === null) invalid.push('maxEditors');
    if (agentQueries === null) invalid.push('agentQueries');
    if (retainedVersions === null) invalid.push('retainedVersions');
    if (trashRetentionDays === null) invalid.push('trashRetentionDays');
    return { ok: false, invalid };
  }
  return {
    ok: true,
    value: { maxEditors, agentQueriesPerMonth: agentQueries, retainedVersions, trashRetentionDays },
  };
}

/**
 * Traduce el formulario una sola vez (011 CA-9, CA-11): o sale el cuerpo que pide la API, o la lista de los campos
 * que no se pudieron traducir (los mensajes los pone la web).
 */
export function parsePlanForm(values: PlanFormValues): PlanFormParse {
  const text = parseText(values);
  const money = parseMoneyAndSize(values);
  const counts = parseCounts(values);
  const invalid = [
    ...(text.ok ? [] : text.invalid),
    ...(money.ok ? [] : money.invalid),
    ...(counts.ok ? [] : counts.invalid),
  ];
  if (text.ok && money.ok && counts.ok && invalid.length === 0) {
    return { request: { ...text.value, ...money.value, ...counts.value } };
  }
  return { invalid };
}

/**
 * La cantidad con la unidad en la que el número sale entero (500 MB no es «0 GB»). Si ninguna unidad lo deja entero,
 * no hay una copia exacta: se devuelve `null` y el campo queda vacío para que lo escriba la persona.
 */
export function amountAndUnit<U extends QuotaUnit | MaxFileUnit>(
  bytes: number,
  units: readonly [U, ...U[]],
): { readonly amount: string; readonly unit: U } | null {
  for (const unit of units) {
    const amount = bytes / BYTES_PER_UNIT[unit];
    if (Number.isInteger(amount)) return { amount: String(amount), unit };
  }
  return null;
}
