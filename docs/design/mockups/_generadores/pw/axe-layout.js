// axe-core + desbordamiento + objetivos táctiles + consola sobre shared/layout, y recorrido de teclado.
// Uso: node axe-layout.js <carpeta de mockups/shared/layout>
const { chromium } = require('playwright');
const fs = require('node:fs'); const path = require('node:path');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const DIR = process.argv[2];

async function auditar(p, etiqueta) {
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () => {
    const res = await axe.run(document, { resultTypes: ['violations'] });
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const visibles = [...document.querySelectorAll('button, a, input, [role="menuitem"]')].filter((e) => {
      const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !e.closest('[inert]');
    });
    const small = visibles.filter((e) => { const b = e.getBoundingClientRect(); return b.height < 24 || b.width < 24; })
      .map((e) => e.textContent.trim().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().height));
    const bajo44 = visibles.filter((e) => e.closest('.drawer, .topbar') && e.getBoundingClientRect().height < 44 && window.innerWidth <= 900)
      .map((e) => (e.getAttribute('aria-label') || e.textContent.trim()).slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().height));
    return { v: res.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`), overflow, small, bajo44 };
  });
  console.log(etiqueta, 'overflow=' + r.overflow, r.v.length ? '\n   ' + r.v.join('\n   ') : 'axe OK',
    r.small.length ? '\n   <24px: ' + r.small.join('; ') : '', r.bajo44.length ? '\n   <44px en cajón/barra (CA-5): ' + r.bajo44.join('; ') : '');
}

const foco = (p) => p.evaluate(() => {
  const a = document.activeElement; return (a.getAttribute('aria-label') || a.textContent.trim()).slice(0, 40);
});
const attr = (p, sel, n) => p.evaluate(([s, k]) => document.querySelector(s).getAttribute(k), [sel, n]);
const oculto = (p, sel) => p.evaluate((s) => document.querySelector(s).hidden, sel);

(async () => {
  const b = await chromium.launch();
  const cons = [];
  for (const w of [360, 1440]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') cons.push(`${w} ${m.text()}`); });
    p.on('pageerror', (e) => cons.push(`${w} pageerror ${e.message}`));
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.html')).sort()) {
      await p.goto('file:///' + path.posix.join(DIR, f), { waitUntil: 'networkidle' });
      await auditar(p, `${w} ${f}`);
    }

    // Recorrido de teclado desde el estado default
    const url = 'file:///' + path.posix.join(DIR, 'layout.html');
    await p.goto(url, { waitUntil: 'networkidle' });
    const log = [];
    await p.focus('#cuenta-btn');
    await p.keyboard.press('Enter');
    log.push(`Enter → expanded=${await attr(p, '#cuenta-btn', 'aria-expanded')} foco=«${await foco(p)}»`);
    await p.keyboard.press('ArrowDown'); log.push(`↓ foco=«${await foco(p)}»`);
    await p.keyboard.press('End'); log.push(`End foco=«${await foco(p)}»`);
    await p.keyboard.press('ArrowDown'); log.push(`↓ (ciclo) foco=«${await foco(p)}»`);
    await p.keyboard.press('ArrowUp'); log.push(`↑ foco=«${await foco(p)}»`);
    await auditar(p, `${w} teclado: menú abierto`);
    await p.keyboard.press('Escape');
    log.push(`Esc → oculto=${await oculto(p, '#cuenta-pop')} expanded=${await attr(p, '#cuenta-btn', 'aria-expanded')} foco=«${await foco(p)}»`);
    await p.keyboard.press('ArrowUp'); log.push(`↑ en el botón → foco=«${await foco(p)}»`);
    await p.keyboard.press('Enter');
    log.push(`Enter en «Cerrar sesión» → diálogo oculto=${await oculto(p, '.dialog')} app inert=${await p.evaluate(() => document.querySelector('.app').inert)} foco=«${await foco(p)}»`);
    await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); log.push(`Tab×2 (trampa) foco=«${await foco(p)}»`);
    await auditar(p, `${w} teclado: diálogo abierto`);
    await p.keyboard.press('Escape');
    log.push(`Esc → diálogo oculto=${await oculto(p, '.dialog')} app inert=${await p.evaluate(() => document.querySelector('.app').inert)} foco=«${await foco(p)}»`);
    await p.keyboard.press('Space');
    await p.keyboard.press('Tab');
    log.push(`Espacio + Tab → menú oculto=${await oculto(p, '#cuenta-pop')}`);
    await p.click('main h1');
    await p.click('#cuenta-btn'); await p.mouse.click(w / 2, 600);
    log.push(`clic fuera → menú oculto=${await oculto(p, '#cuenta-pop')}`);
    if (w === 360) {
      await p.focus('.menu-btn'); await p.keyboard.press('Enter');
      log.push(`cajón: Enter → oculto=${await oculto(p, '#cajon')} expanded=${await attr(p, '.menu-btn', 'aria-expanded')} foco=«${await foco(p)}»`);
      await auditar(p, `${w} teclado: cajón abierto`);
      await p.keyboard.press('Escape');
      log.push(`cajón: Esc → oculto=${await oculto(p, '#cajon')} foco=«${await foco(p)}»`);
    }
    console.log(`${w} recorrido:\n   ` + log.join('\n   '));
    await p.close();
  }
  console.log(cons.length ? 'consola: ' + cons.join(' | ') : 'consola: sin errores ni advertencias');
  await b.close();
})();
