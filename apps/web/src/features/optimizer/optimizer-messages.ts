import { formatBytes, type OptimizationStatus } from '@nimbo/contracts';

export const OPTIMIZATION_MESSAGES = {
  idle: 'Calcula cuánto espacio recuperarías al optimizar esta imagen sin cambiar su formato ni sus dimensiones.',
  estimating: 'Calculando el ahorro…',
  optimizing: 'Optimizando…',
  notWorthIt: 'El ahorro sería mínimo; no vale la pena optimizar esta imagen.',
  unavailable: 'No se puede optimizar esta imagen. Tu archivo no cambió.',
  minimalSavings: 'El ahorro real fue mínimo. Tu archivo no cambió.',
  changed:
    'Tu archivo cambió mientras se optimizaba. No aplicamos la optimización; puedes calcular el ahorro de nuevo.',
  stale: 'La estimación ya no está vigente. Calcula el ahorro de nuevo.',
  deleted:
    'No encontramos este archivo. Puede que lo hayas movido a la papelera o que ya no exista.',
  integrity:
    'No pudimos optimizar este archivo sin dañarlo. Tu archivo no cambió y puedes seguir usándolo como está.',
  service:
    'El optimizador no está disponible ahora. Tu archivo no cambió; vuelve a intentarlo más tarde.',
} as const;

/** Porcentaje con la misma convención que `formatBytes` (coma decimal, un decimal como lo entrega la API). */
function percentLabel(percent: number): string {
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1).replace('.', ',');
}

export function savingsLabel(status: OptimizationStatus): string {
  return `${formatBytes(status.savedBytes ?? 0)} (${percentLabel(status.savedPercent ?? 0)} %)`;
}

export function optimizationResultMessage(status: OptimizationStatus): string {
  if (status.state === 'completada')
    return `Optimizamos tu imagen: ahorraste ${savingsLabel(status)}.`;
  switch (status.reason) {
    case 'ahorro_minimo':
      return OPTIMIZATION_MESSAGES.minimalSavings;
    case 'version_cambiada':
      return OPTIMIZATION_MESSAGES.changed;
    case 'archivo_eliminado':
      return OPTIMIZATION_MESSAGES.deleted;
    case 'integridad':
      return OPTIMIZATION_MESSAGES.integrity;
    default:
      return OPTIMIZATION_MESSAGES.service;
  }
}
