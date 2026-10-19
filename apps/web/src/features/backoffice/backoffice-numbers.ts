/**
 * Porcentajes de las tablas de métricas (011): coma decimal, como los bytes (`formatBytes` de `contracts`, PD-91). Los
 * conteos no viven aquí: usan `formatCount` de `lib/format-plan.ts` (espacio de miles), el mismo del catálogo.
 */

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** «99,3 %»: la parte `part` de `whole`, con un decimal (mockup `backoffice/metricas`); un total en 0 da «0,0 %». */
export function percentText(part: number, whole: number): string {
  const value = whole === 0 ? 0 : (part / whole) * 100;
  return `${round1(value).toFixed(1).replace('.', ',')} %`;
}
