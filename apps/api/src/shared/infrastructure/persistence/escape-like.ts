/** Comodines de `LIKE` y su carácter de escape (`\`, el de PostgreSQL por omisión). */
const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

/**
 * `text` con `%`, `_` y `\` precedidos de `\`: dentro de un patrón `LIKE … ESCAPE '\'` son texto, no comodines. Fuente
 * única para `storage` (copias de nombres, búsqueda 018) e `identity` (filtro por correo).
 */
export const escapeLike = (text: string): string => text.replace(LIKE_SPECIAL_CHARACTERS, '\\$&');
