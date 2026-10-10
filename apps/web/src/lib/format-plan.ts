/** Presentación del catálogo de planes (008 RN-1): el contrato trae centavos enteros y bytes como texto decimal. */

const CENTS_PER_QUETZAL = 100;
const BYTES_PER_UNIT = 1024;
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Enteros con espacio de no separación como separador de miles: 2 000, 10 000 (como el mockup). */
export function formatCount(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Centavos enteros a quetzales con dos decimales: Q0.00, Q45.00, Q110.00. */
export function formatQuetzales(priceCents: number): string {
  const quetzales = Math.trunc(priceCents / CENTS_PER_QUETZAL);
  const cents = String(priceCents % CENTS_PER_QUETZAL).padStart(2, '0');
  return `Q${formatCount(quetzales)}.${cents}`;
}

/** Bytes del plan en potencias de 1024, como el catálogo de la 006a (RN-1): «15 GB», «1.5 GB». */
export function formatPlanBytes(bytes: string): string {
  let size = Number(bytes);
  let unitIndex = 0;
  while (size >= BYTES_PER_UNIT && unitIndex < BYTE_UNITS.length - 1) {
    size /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  return `${String(Number(size.toFixed(1)))} ${BYTE_UNITS[unitIndex]}`;
}

/** Edición `.docx` (CA-2, RN-6): «Solo lectura» con `maxEditors` 0 y «Sí» en cualquier otro caso. */
export function formatDocxEditing(maxEditors: number): string {
  return maxEditors > 0 ? 'Sí' : 'Solo lectura';
}

/** Editores simultáneos (CA-2): «—» cuando el plan no edita. */
export function formatMaxEditors(maxEditors: number): string {
  return maxEditors > 0 ? formatCount(maxEditors) : '—';
}
