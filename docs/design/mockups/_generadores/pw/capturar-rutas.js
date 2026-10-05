// Captura mockups a 360 y 1440 px (fullPage) en un worktree dado.
// Uso: node capturar-rutas.js <repo> <mockup.html>=<modulo/pantalla/pantalla--estado> ...
const { chromium } = require('playwright');
const path = require('node:path');

const [repo, ...pares] = process.argv.slice(2);
const SCREENS = pares.map((p) => p.split('='));
const WIDTHS = [
  [360, 800],
  [1440, 900],
];

(async () => {
  const browser = await chromium.launch();
  for (const [width, height] of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height }, locale: 'es-GT', timezoneId: 'America/Guatemala' });
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    for (const [mockup, capture] of SCREENS) {
      const url = 'file:///' + path.posix.join(repo, 'docs/design/mockups', mockup);
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const out = path.posix.join(repo, 'docs/design/capturas', `${capture}--${width}.png`);
      await page.screenshot({ path: out, fullPage: true });
      const texto = await page.evaluate(() => document.body.innerText);
      console.log(`${capture}--${width}.png  errores=${errores.length}  largo_texto=${texto.length}`);
    }
    await page.close();
  }
  await browser.close();
})();
