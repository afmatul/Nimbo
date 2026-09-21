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

describe('Tokens de Cielo Sereno y Contraste WCAG 2.1 AA (DF-41 a DF-45, CA-1, CA-2)', () => {
  const globalsCssPath = path.resolve(__dirname, 'globals.css');

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

  describe('Verificación matemática de contraste AA (mínimo 4.5:1 para texto, 3.0:1 para no-texto)', () => {
    it('DF-41: botón primario CTA (#4A6FA5) con texto blanco tiene ratio >= 4.5:1', () => {
      const ratio = getContrastRatio('#4A6FA5', '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('DF-41: hover de botón primario (#3B5A8A) con texto blanco tiene ratio >= 4.5:1', () => {
      const ratio = getContrastRatio('#3B5A8A', '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('DF-42: texto atenuado (#5E7389) sobre fondo claro (#F4F7FB y #FAFCFF) tiene ratio >= 4.5:1', () => {
      const ratioBg = getContrastRatio('#5E7389', '#F4F7FB');
      const ratioCard = getContrastRatio('#5E7389', '#FAFCFF');
      expect(ratioBg).toBeGreaterThanOrEqual(4.5);
      expect(ratioCard).toBeGreaterThanOrEqual(4.5);
    });

    it('DF-43: textos semánticos tienen ratio >= 4.5:1 sobre fondo de card (#FAFCFF)', () => {
      const ratioSuccess = getContrastRatio('#3A7560', '#FAFCFF');
      const ratioWarning = getContrastRatio('#8A6424', '#FAFCFF');
      const ratioDanger = getContrastRatio('#A34F4F', '#FAFCFF');

      expect(ratioSuccess).toBeGreaterThanOrEqual(4.5);
      expect(ratioWarning).toBeGreaterThanOrEqual(4.5);
      expect(ratioDanger).toBeGreaterThanOrEqual(4.5);
    });

    it('DF-43: botón destructivo (#A34F4F) con texto blanco tiene ratio >= 4.5:1', () => {
      const ratio = getContrastRatio('#A34F4F', '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('DF-45: borde de controles interactivos / inputs (#7F93AA) cumple WCAG 1.4.11 (>= 3.0:1)', () => {
      const ratio = getContrastRatio('#7F93AA', '#FAFCFF');
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it('Panel del agente: texto (#D8E4F0) sobre fondo (#2C3A52) tiene ratio >= 4.5:1', () => {
      const ratio = getContrastRatio('#D8E4F0', '#2C3A52');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });
});
