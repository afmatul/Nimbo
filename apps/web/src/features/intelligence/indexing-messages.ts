import type { IndexingReason, IndexingStatusResponse } from '@nimbo/contracts';

import { dateTimeLabel } from '../../lib/format-date';

/**
 * Textos del estado de indexación (019 §6, mockup `storage/ficha-archivo`, decisiones de UX de 019), armados por código:
 * la API nunca manda texto visible. Tuteo, sin «embeddings», «fragmentos» ni «vector».
 */

/** `info` para lo que no es un error (indexando, no indexable); `error` solo para `fallido`. */
export type IndexingNoticeTone = 'info' | 'error';

export interface IndexingNotice {
  readonly tone: IndexingNoticeTone;
  readonly title: string;
  readonly text: string;
  /** Mientras se indexa: el ícono del aviso gira. */
  readonly inProgress?: boolean;
}

const NAME_ONLY = 'Se busca solo por nombre; puedes descargarlo y compartirlo como siempre.';

const INDEXING_NOTICE: IndexingNotice = {
  tone: 'info',
  title: 'Indexando… ya puedes seguir trabajando.',
  text: 'Estamos leyendo este archivo para que puedas consultarlo con el agente. Descargarlo, editarlo y compartirlo funciona con normalidad. Este aviso se actualiza solo cuando termine.',
  inProgress: true,
};

/** Motivos de `no_indexable` (CA-4, CA-5, CA-7). Sin OCR: el PDF escaneado sugiere una versión con texto. */
const NOT_INDEXABLE_NOTICES: Partial<Record<IndexingReason, IndexingNotice>> = {
  sin_texto: {
    tone: 'info',
    title: 'No pudimos leer el texto de este PDF. Se busca solo por nombre.',
    text: 'Parece un documento escaneado, sin texto que se pueda seleccionar. Puedes descargarlo y compartirlo como siempre. Si tienes una copia con texto, súbela con el mismo nombre y elige «Reemplazar».',
  },
  formato_no_soportado: {
    tone: 'info',
    title: 'No pudimos leer el contenido de este archivo.',
    text: `Su contenido no corresponde al tipo que indica su nombre. ${NAME_ONLY}`,
  },
  demasiado_grande: {
    tone: 'info',
    title: 'Este archivo es demasiado grande para indexarlo.',
    text: NAME_ONLY,
  },
};

const FAILED_TITLE = 'No pudimos indexar este archivo.';

const FAILED_NOTICE: IndexingNotice = {
  tone: 'error',
  title: FAILED_TITLE,
  text: 'Lo intentamos varias veces y no fue posible. Tu archivo está a salvo y puedes seguir trabajando. Reintenta ahora o inténtalo más tarde.',
};

/** Sin permiso de edición (lector, CA-13 y CA-19): la interfaz no ofrece lo que el servidor niega. */
const FAILED_READ_ONLY_NOTICE: IndexingNotice = {
  tone: 'error',
  title: FAILED_TITLE,
  text: 'Solo quien puede editarlo puede reintentarlo. Mientras tanto, el archivo sigue disponible para descargar.',
};

const RETRY_FAILED_NOTICE: IndexingNotice = {
  tone: 'error',
  title: 'No pudimos reintentar la indexación.',
  text: 'Tu archivo no cambió. Revisa tu conexión y vuelve a intentarlo en unos segundos.',
};

function failedNotice(status: IndexingStatusResponse, retryFailed: boolean): IndexingNotice {
  if (!status.canRetry) return FAILED_READ_ONLY_NOTICE;
  return retryFailed ? RETRY_FAILED_NOTICE : FAILED_NOTICE;
}

/** El aviso de la ficha para un estado, o `null` si no lleva (indexado, o un tipo que no se indexa). */
export function indexingNoticeOf(
  status: IndexingStatusResponse,
  retryFailed: boolean,
): IndexingNotice | null {
  switch (status.state) {
    case 'pendiente':
    case 'indexando':
      return INDEXING_NOTICE;
    case 'no_indexable':
      return (status.reason && NOT_INDEXABLE_NOTICES[status.reason]) ?? null;
    case 'fallido':
      return failedNotice(status, retryFailed);
    default:
      return null;
  }
}

const INDEXED_NOTICE = 'Listo para consultar con el agente';

/** Toast al terminar de indexarse mientras se mira la ficha (CA-14). */
export function indexedNotice(fileName: string | null): string {
  return fileName === null ? `${INDEXED_NOTICE}.` : `${INDEXED_NOTICE}: ${fileName}.`;
}

/** Fila «Indexación» de Detalles: cuándo y de qué versión (RN-1: siempre la actual); `null` si no se indexa. */
export function indexingDetailOf(
  status: IndexingStatusResponse,
  versionNumber: number,
  now: number,
): string | null {
  const version = `versión ${String(versionNumber)}`;
  const when = status.updatedAt === null ? null : dateTimeLabel(status.updatedAt, now);
  switch (status.state) {
    case 'pendiente':
    case 'indexando':
      return `En curso · ${version}`;
    case 'indexado':
      return when === null ? version : `${when} · ${version}`;
    case 'no_indexable':
      return 'No aplica: se busca solo por nombre';
    case 'fallido':
      return when === null ? `Falló · ${version}` : `Falló ${when} · ${version}`;
    default:
      return null;
  }
}
