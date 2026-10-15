/** `slug` del plan gratuito que recibe toda cuenta de cliente (006a; spec 009 CA-1). Nunca se desactiva (011 CA-11). */
export const PERSONAL_PLAN_SLUG = 'personal';

/** Largo de la columna `plan.slug` (006a). */
const SLUG_MAX_LENGTH = 50;
const DIACRITICS = /\p{M}/gu;
const NOT_SLUG = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

/**
 * Identificador corto que deriva el servidor del nombre (spec 011 RN-4): minúsculas sin tildes, palabras unidas por un
 * guion y como mucho 50 caracteres. Los cuatro de la semilla no cambian (no se recalculan).
 */
export const slugFromName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NOT_SLUG, '-')
    .replace(EDGE_DASHES, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(EDGE_DASHES, '');
