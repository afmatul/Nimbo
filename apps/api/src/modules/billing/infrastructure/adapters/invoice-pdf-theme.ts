/**
 * Tokens de Cielo Sereno que usa la factura PDF, con el nombre y el valor ajustado a AA de
 * `apps/web/src/app/globals.css` (`docs/sdd/ui-guidelines.md` §2). El PDF no lee CSS: este es el único lugar del `api`
 * con esos valores; si cambia un token en la guía, cambia aquí.
 */
export const CIELO_SERENO = {
  background: '#F4F7FB',
  card: '#FAFCFF',
  border: '#DDE6F0',
  muted: '#EEF3F9',
  foreground: '#1E2D40',
  secondaryForeground: '#3A5068',
  mutedForeground: '#5E7389',
  primary: '#4A6FA5',
  primaryForeground: '#FFFFFF',
  brand: '#6B8DD6',
  success: '#6DB99A',
  successForeground: '#3A7560',
} as const;

/**
 * Fuentes estándar de PDF en WinAnsi: tildes, «ñ», «¿» y «¡» sin archivos de fuente (ADR-0028). Inter (la familia de la
 * guía) no se incrusta para no versionar un `.ttf` en el `api`; Helvetica es la sans-serif que todo visor ya trae.
 */
export const INVOICE_FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
} as const;
