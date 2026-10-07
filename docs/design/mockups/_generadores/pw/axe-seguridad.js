const { chromium } = require('playwright');
const fs = require('node:fs'); const path = require('node:path');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const DIR = process.argv[2];
(async () => {
  const b = await chromium.launch();
  for (const w of [360, 1440]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 }, locale: 'es-GT', timezoneId: 'America/Guatemala' });
    const cons = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') cons.push(m.text()); });
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.html')).sort()) {
      await p.goto('file:///' + path.posix.join(DIR, f), { waitUntil: 'networkidle' });
      await p.addScriptTag({ content: AXE });
      const r = await p.evaluate(async () => {
        const res = await axe.run(document, { resultTypes: ['violations'] });
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        const small = [...document.querySelectorAll('button, a, input')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 24 || r.width < 24); }).map((e) => e.textContent.trim().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().height));
        return { v: res.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' | ')}`), overflow, small };
      });
      console.log(w, f, 'overflow=' + r.overflow, r.v.length ? '\n   ' + r.v.join('\n   ') : 'axe OK', r.small.length ? '\n   small: ' + r.small.join('; ') : '');
    }
    if (cons.length) console.log('console:', cons);
    await p.close();
  }
  await b.close();
})();
