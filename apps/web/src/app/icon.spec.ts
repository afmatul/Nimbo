import * as fs from 'fs';
import * as path from 'path';

const LOGO_FILE = path.join(__dirname, '..', '..', 'public', 'brand', 'nimbo-icon.svg');

describe('icon.svg (favicon)', () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8').toLowerCase();

  it('es el logo oficial de Nimbo (docs/design/logos), igual al de public/brand', () => {
    expect(svg).toBe(fs.readFileSync(LOGO_FILE, 'utf8').toLowerCase());
  });

  it('lleva la nube azul con la estrella blanca y ningún metadato de generación', () => {
    expect(new Set(svg.match(/#[0-9a-f]{6}/g))).toEqual(new Set(['#6b8fd6', '#ffffff']));
    expect(svg).not.toContain('<metadata');
  });
});
