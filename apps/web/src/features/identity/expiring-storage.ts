/** Vida máxima de lo que el registro deja en el navegador (plan elegido, correo para pedir enlace). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type StringFields<K extends string> = Readonly<Record<K, string>>;

function hasOnlyStringFields<K extends string>(
  value: unknown,
  fields: readonly K[],
): value is StringFields<K | 'savedAt'> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const expected: readonly string[] = [...fields, 'savedAt'];
  const keys = Object.keys(record);
  return (
    keys.length === expected.length && expected.every((field) => typeof record[field] === 'string')
  );
}

/** Guarda `values` con la hora de guardado. Sin almacenamiento, no hace nada. */
export function saveExpiring<K extends string>(
  storage: Storage | undefined,
  key: string,
  values: StringFields<K>,
  now: Date,
): void {
  storage?.setItem(key, JSON.stringify({ ...values, savedAt: now.toISOString() }));
}

/**
 * Lee y borra el valor de `key` si tiene exactamente `fields` (texto) y menos de 24 h. Caducado, con otro formato,
 * ausente o sin almacenamiento → `null`.
 */
export function takeExpiring<K extends string>(
  storage: Storage | undefined,
  key: string,
  fields: readonly K[],
  now: Date,
): StringFields<K> | null {
  if (storage === undefined) return null;
  const raw = storage.getItem(key);
  storage.removeItem(key);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!hasOnlyStringFields(parsed, fields)) return null;
  const savedAt = Date.parse(parsed.savedAt);
  if (Number.isNaN(savedAt) || now.getTime() - savedAt >= MAX_AGE_MS) return null;
  return Object.fromEntries(fields.map((field) => [field, parsed[field]])) as StringFields<K>;
}
