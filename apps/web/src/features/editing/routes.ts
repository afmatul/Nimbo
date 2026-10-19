/** Editor de un `.docx` (spec 016): una URL por archivo, dentro de `(cliente)` (los roles internos no llegan, CA-17). */
export function editorPath(fileId: string): string {
  return `/editor/${encodeURIComponent(fileId)}`;
}

/** Comparador de planes público (008): adonde lleva «Ver planes» cuando el plan no incluye edición (CA-5). */
export const PLANS_PATH = '/planes';
