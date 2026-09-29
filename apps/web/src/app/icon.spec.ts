import * as fs from 'fs';
import * as path from 'path';

const CLOUD_PATH = 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z';

function tokenValue(css: string, name: string): string {
  const match = new RegExp(`--${name}: *(#[0-9a-fA-F]{6})`).exec(css);
  if (match?.[1] === undefined) throw new Error(`Falta el token --${name}`);
  return match[1].toLowerCase();
}

describe('icon.svg (favicon)', () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8').toLowerCase();
  const css = fs.readFileSync(path.join(__dirname, 'globals.css'), 'utf8');

  it('usa el isotipo de nube de PublicHeader (Cloud de lucide)', () => {
    expect(svg).toContain(CLOUD_PATH.toLowerCase());
  });

  it('usa los valores de los tokens primary y primary-foreground, sin otros colores', () => {
    const colors = new Set(svg.match(/#[0-9a-f]{6}/g));

    expect(colors).toEqual(
      new Set([tokenValue(css, 'primary'), tokenValue(css, 'primary-foreground')]),
    );
  });
});
