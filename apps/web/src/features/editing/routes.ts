/** Editor de un `.docx` (spec 016): una URL por archivo, dentro de `(cliente)` (los roles internos no llegan, CA-17). */
export function editorPath(fileId: string): string {
  return `/editor/${encodeURIComponent(fileId)}`;
}

/** «Cambiar de plan» (010): adonde lleva «Ver planes» cuando el plan no incluye edición (CA-5). */
export { CHANGE_PLAN_PATH } from '../billing';
