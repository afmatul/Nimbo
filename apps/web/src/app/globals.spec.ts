import * as fs from 'fs';
import * as path from 'path';

/** Calcula la luminancia relativa según WCAG 2.1 */
function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Calcula el ratio de contraste entre dos colores hex (mínimo 1:1, máximo 21:1) */
function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (brighter + 0.05) / (darker + 0.05);
}

/** Mezcla un color hex con canal alfa (ej. #6b8dd620) sobre fondo blanco para obtener el color sólido real */
function blendOnWhite(hexWithAlpha: string): string {
  const clean = hexWithAlpha.replace('#', '');
  if (clean.length === 6) return hexWithAlpha;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const a = parseInt(clean.slice(6, 8), 16) / 255;
  const blendedR = Math.round(r * a + 255 * (1 - a))
    .toString(16)
    .padStart(2, '0');
  const blendedG = Math.round(g * a + 255 * (1 - a))
    .toString(16)
    .padStart(2, '0');
  const blendedB = Math.round(b * a + 255 * (1 - a))
    .toString(16)
    .padStart(2, '0');
  return `#${blendedR}${blendedG}${blendedB}`;
}

describe('Tokens de Cielo Sereno y Contraste WCAG 2.1 AA (DF-41 a DF-45, CA-1, CA-2)', () => {
  const globalsCssPath = path.resolve(__dirname, 'globals.css');

  /** Lee el valor real de cualquier variable CSS directamente desde globals.css */
  function getCssVar(name: string): string {
    const content = fs.readFileSync(globalsCssPath, 'utf8');
    const match = content.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`Variable ${name} no encontrada en globals.css`);
    return match[1].trim();
  }

  it('CA-1: el archivo globals.css existe y define los tokens centrales', () => {
    expect(fs.existsSync(globalsCssPath)).toBe(true);
    const content = fs.readFileSync(globalsCssPath, 'utf8');
    expect(content).toContain('--background');
    expect(content).toContain('--foreground');
    expect(content).toContain('--primary');
    expect(content).toContain('--primary-hover');
    expect(content).toContain('--destructive');
    expect(content).toContain('--agent-bg');
    expect(content).toContain('--agent-text');
  });

  it('CA-6: incluye bloque para prefers-reduced-motion: reduce', () => {
    const content = fs.readFileSync(globalsCssPath, 'utf8');
    expect(content).toContain('@media (prefers-reduced-motion: reduce)');
    expect(content).toContain('animation-duration: 0.01ms');
  });

  describe('Verificación matemática de contraste AA leyendo desde globals.css (I-1)', () => {
    it('DF-41: botón primario (--primary) con texto blanco tiene ratio >= 4.5:1', () => {
      const primary = getCssVar('--primary');
      const white = getCssVar('--primary-foreground');
      const ratio = getContrastRatio(primary, white);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('DF-41: hover de botón primario (--primary-hover) con texto blanco tiene ratio >= 4.5:1', () => {
      const primaryHover = getCssVar('--primary-hover');
      const white = getCssVar('--primary-foreground');
      const ratio = getContrastRatio(primaryHover, white);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('DF-42: texto atenuado (--muted-foreground) sobre fondo claro (--background y --card) tiene ratio >= 4.5:1', () => {
      const mutedForeground = getCssVar('--muted-foreground');
      const bg = getCssVar('--background');
      const card = getCssVar('--card');
      expect(getContrastRatio(mutedForeground, bg)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(mutedForeground, card)).toBeGreaterThanOrEqual(4.5);
    });

    it('DF-43: textos semánticos (--success-foreground, --warning-foreground, --destructive) tienen ratio >= 4.5:1 sobre --card', () => {
      const card = getCssVar('--card');
      const successText = getCssVar('--success-foreground');
      const warningText = getCssVar('--warning-foreground');
      const dangerText = getCssVar('--destructive');

      expect(getContrastRatio(successText, card)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(warningText, card)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(dangerText, card)).toBeGreaterThanOrEqual(4.5);
    });

    it('DF-43: botón destructivo (--destructive) con texto blanco tiene ratio >= 4.5:1', () => {
      const destructive = getCssVar('--destructive');
      const white = getCssVar('--primary-foreground');
      expect(getContrastRatio(destructive, white)).toBeGreaterThanOrEqual(4.5);
    });

    it('DF-45: borde de controles interactivos / inputs (--input) cumple WCAG 1.4.11 (>= 3.0:1) sobre --card', () => {
      const inputBorder = getCssVar('--input');
      const card = getCssVar('--card');
      expect(getContrastRatio(inputBorder, card)).toBeGreaterThanOrEqual(3.0);
    });

    it('Panel del agente: texto (--agent-text) sobre fondo (--agent-bg) tiene ratio >= 4.5:1', () => {
      const agentText = getCssVar('--agent-text');
      const agentBg = getCssVar('--agent-bg');
      expect(getContrastRatio(agentText, agentBg)).toBeGreaterThanOrEqual(4.5);
    });

    it('DF-44: chips de tipo de archivo (--file-*) tienen ratio >= 4.5:1 sobre su fondo al 12% (--file-*-bg)', () => {
      const fileTypes = ['docx', 'xlsx', 'pptx', 'pdf', 'img', 'other'];

      fileTypes.forEach((ext) => {
        const textColor = getCssVar(`--file-${ext}`);
        const bgHexWithAlpha = getCssVar(`--file-${ext}-bg`);
        const effectiveBg = blendOnWhite(bgHexWithAlpha);
        const ratio = getContrastRatio(textColor, effectiveBg);

        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    });

    it('DF-44: textos de tipo de archivo (--file-*) tienen ratio >= 4.5:1 sobre fondo de tarjeta (--card)', () => {
      const card = getCssVar('--card');
      const fileTypes = ['docx', 'xlsx', 'pptx', 'pdf', 'img', 'other'];

      fileTypes.forEach((ext) => {
        const textColor = getCssVar(`--file-${ext}`);
        const ratio = getContrastRatio(textColor, card);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    });
  });
});
