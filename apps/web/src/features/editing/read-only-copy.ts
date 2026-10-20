import type { ReadOnlyReason } from '@nimbo/contracts';

/** Qué ofrece el aviso: ir al comparador de planes, renovar el plan vencido, volver a intentar la edición o nada. */
export type ReadOnlyAction = 'plans' | 'renew' | 'retry' | null;

/** Texto del aviso de solo lectura y de la presencia; sale solo del código de la API (plan §4). */
export interface ReadOnlyCopy {
  /** Un límite no es un error (`warning`); ser lector es información (`info`). */
  readonly tone: 'info' | 'warning';
  readonly title: string;
  readonly description: string;
  readonly action: ReadOnlyAction;
  /** Si el motivo impide editar a cualquiera, la presencia dice la causa en lugar del conteo «N de L editores». */
  readonly blockedLabel: string | null;
  readonly footer: string;
}

const SAVE_FOOTER =
  'Cuando todos cierren el documento, guardaremos una versión nueva con quienes participaron.';

/** Título del límite alcanzado con el máximo del plan de la cuenta propietaria, que viene de la API (RN-3). */
function limitTitle(maxEditors: number): string {
  return `Hay ${String(maxEditors)} editores; estás en solo lectura. Inténtalo en unos minutos`;
}

/**
 * Textos por motivo (spec §6). `EDITING_PLAN_READ_ONLY` es el plan sin edición (Personal, CA-5) y
 * `EDITING_ACCOUNT_READ_ONLY` la suscripción vencida (spec 010, mockup `editor--solo-lectura-vencida`); el de la cuenta
 * propietaria no dice cuál de los dos ni ofrece acciones de plan, porque es de otra cuenta (CA-22).
 */
const READ_ONLY_COPIES: Readonly<Record<ReadOnlyReason, ReadOnlyCopy>> = {
  EDITING_VIEW_ONLY: {
    tone: 'info',
    title: 'Puedes ver este documento, pero no editarlo',
    description:
      'Tienes acceso de lector. Si necesitas cambiarlo, pide acceso de editor a quien te lo compartió.',
    action: null,
    blockedLabel: null,
    footer: SAVE_FOOTER,
  },
  EDITING_PLAN_READ_ONLY: {
    tone: 'warning',
    title: 'Tu plan no incluye edición',
    description:
      'Puedes ver tus documentos. Para editarlos en línea, y con otras personas, cambia a un plan con edición.',
    action: 'plans',
    blockedLabel: 'Tu plan no incluye edición',
    footer:
      'Con un plan con edición, cada sesión guarda una versión nueva con quienes participaron.',
  },
  EDITING_OWNER_PLAN_READ_ONLY: {
    tone: 'warning',
    title: 'El plan de la cuenta propietaria no incluye edición',
    description:
      'Puedes leer este documento, pero el plan de la cuenta propietaria no permite editarlo en línea.',
    action: null,
    blockedLabel: 'Edición no disponible',
    footer: 'Cuando la cuenta propietaria tenga un plan con edición, podrás editarlo aquí.',
  },
  EDITING_ACCOUNT_READ_ONLY: {
    tone: 'warning',
    title: 'Tu suscripción venció; tus archivos están en solo lectura',
    description: 'Nada se borró. Renueva tu plan para volver a editar este documento.',
    action: 'renew',
    blockedLabel: 'Solo lectura',
    footer: 'Al renovar, vuelves a editar con el límite de tu plan.',
  },
  EDITING_LIMIT_REACHED: {
    tone: 'warning',
    title: '',
    description:
      'Lo abrimos en solo lectura para que puedas leerlo; cuando alguien salga, pulsa «Intentar editar».',
    action: 'retry',
    blockedLabel: null,
    footer: SAVE_FOOTER,
  },
  EDITING_FILE_TOO_LARGE: {
    tone: 'warning',
    title: 'Este documento es demasiado grande para editarlo en línea',
    description: 'Puedes leerlo aquí o descargarlo para editarlo en tu equipo.',
    action: null,
    blockedLabel: 'No se puede editar en línea',
    footer: 'Puedes descargarlo, editarlo en tu equipo y subirlo de nuevo como versión nueva.',
  },
};

export function readOnlyCopy(reason: ReadOnlyReason, maxEditors: number): ReadOnlyCopy {
  const copy = READ_ONLY_COPIES[reason];
  return reason === 'EDITING_LIMIT_REACHED' ? { ...copy, title: limitTitle(maxEditors) } : copy;
}

/** Pie de la presencia en edición (RN-4): explica que no hay «Guardar». */
export const EDITING_FOOTER = SAVE_FOOTER;
