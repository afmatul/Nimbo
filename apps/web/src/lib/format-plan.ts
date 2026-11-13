/**
 * Presentación del catálogo de planes (008 RN-1): el contrato trae centavos enteros y bytes como texto decimal. El
 * dinero se formatea con `formatGtq` de `contracts` (009 RN-1, ADR-0028).
 */
import { formatBytes } from '@nimbo/contracts';

/** Enteros con espacio de no separación como separador de miles: 2 000, 10 000 (como el mockup). */
export function formatCount(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Bytes del plan (texto decimal, ADR-0016) con el mismo formateador que el resto de la UI: `formatBytes` de
 * `contracts`, base 1000 y coma decimal (PD-91). El catálogo guarda sus límites en unidades decimales
 * (migración 20261104100000), así que el Pro se lee «100 GB» exacto en todas las pantallas.
 */
export function formatPlanBytes(bytes: string): string {
  return formatBytes(Number(bytes));
}

/** Edición `.docx` (CA-2, RN-6): «Solo lectura» con `maxEditors` 0 y «Sí» en cualquier otro caso. */
export function formatDocxEditing(maxEditors: number): string {
  return maxEditors > 0 ? 'Sí' : 'Solo lectura';
}

/** Editores simultáneos (CA-2): «—» cuando el plan no edita. */
export function formatMaxEditors(maxEditors: number): string {
  return maxEditors > 0 ? formatCount(maxEditors) : '—';
}
