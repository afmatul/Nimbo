// Recorre la app real, captura cada estado y lo compara con su mockup aprobado.
// Uso:  node comparar-estados.mjs [--ancho 1440|360] [--solo editor,enlace,visitante,compartidos] [--repo <ruta>] [--salida <carpeta>]
// Prerrequisitos: `playwright` instalado aparte (no es dependencia del monorepo, ver _generadores/README.md); `docker` en el PATH
// (el estado «no-disponible» del editor detiene y vuelve a iniciar el contenedor nimbo-onlyoffice-1); cuentas lucia/diego (plan Pro)
// y carla (Personal), con `informe-demo.docx` subido por lucia y por carla, y los IDs de ID_L / ID_C ajustados.
// Cada corrida inicia sesión una vez por cuenta (el login permite 20 intentos por IP cada 15 min). No reutilices sesiones guardadas:
// el servidor detecta el reúso del token de refresco y revoca la sesión.
// Requiere la app arriba (pnpm start:all --onlyoffice).
// Salida: <salida>/comparacion/informe-<ancho>.html con real | captura aprobada y los textos del mockup que no aparecen en la real.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const ANCHO = Number(arg('ancho', 1440));
const REPO = arg('repo', path.resolve(import.meta.dirname, '../../../../..').replaceAll(String.fromCharCode(92), '/'));
const SOLO = arg('solo', 'editor,enlace,visitante,compartidos').split(',');
const WEB = 'http://localhost:3002', PUB = 'http://localhost', PASS = 'Nimbo-Demo-2026!';
const SALIDA = arg('salida', path.join(os.tmpdir(), 'nimbo-comparacion'));
const OUT = path.join(SALIDA, 'comparacion') + path.sep;
const SES = path.join(SALIDA, 'sesion-');
fs.mkdirSync(OUT, { recursive: true });
const MOCK = (m) => `${REPO}/docs/design/mockups/${m}.html`;
const CAPT = (m) => `${REPO}/docs/design/capturas/${m}--${ANCHO}.png`;
const H = ANCHO === 360 ? 800 : 900;

const resultados = [];
const b = await chromium.launch();
const nuevoCtx = (estado) => b.newContext({ viewport: { width: ANCHO, height: H }, locale: 'es-GT', timezoneId: 'America/Guatemala', reducedMotion: 'reduce', ...(estado ? { storageState: estado } : {}), acceptDownloads: true });
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

const sesionesEstaCorrida = new Set();
/** Una sola sesión por cuenta (el login tiene límite por IP: 20 cada 15 min). */
async function sesion(nombre) {
  const f = `${SES}${nombre}.json`;
  // No se reutiliza una sesión de otra corrida: el servidor rota el token de refresco y detecta su reúso (lo revoca).
  if (sesionesEstaCorrida.has(nombre)) return f;
  sesionesEstaCorrida.add(nombre);
  const c = await nuevoCtx(); const p = await c.newPage();
  await p.goto(WEB + '/iniciar-sesion'); await p.waitForLoadState('networkidle');
  await p.getByLabel(/correo/i).fill(`${nombre}.demo@example.com`);
  await p.getByLabel(/contraseña/i).first().fill(PASS);
  await p.getByRole('button', { name: /iniciar sesión|entrar/i }).click();
  await p.waitForURL((u) => !u.pathname.includes('iniciar-sesion'), { timeout: 30000 });
  await c.storageState({ path: f }); await c.close(); return f;
}

/** Textos del mockup (solo el diálogo si existe) que NO están en el texto real. Ignora líneas con cifras (datos de ejemplo). */
const mockPage = await (await nuevoCtx()).newPage();
async function faltantes(mockup, textoReal) {
  await mockPage.goto('file:///' + MOCK(mockup)); await mockPage.waitForLoadState('load');
  const t = await mockPage.evaluate(() => (document.querySelector('[role="dialog"], [role="alertdialog"]') || document.querySelector('main') || document.body).innerText);
  const real = norm(textoReal);
  return t.split('\n').map((l) => l.trim()).filter((l) => l.length > 3 && !/\d|@|Pablo|Mónica|Andrea|Lucía Barrios/.test(l) && !real.includes(norm(l)));
}

async function snap(id, mockup, pagina, ambito) {
  const real = ambito || pagina.locator('body');
  await pagina.waitForTimeout(500);
  const png = `${id}--real--${ANCHO}.png`;
  await (ambito ? ambito.screenshot({ path: OUT + png }) : pagina.screenshot({ path: OUT + png, fullPage: true }));
  const texto = await real.innerText();
  const falta = await faltantes(mockup, texto);
  resultados.push({ id, mockup, png, capt: CAPT(mockup), falta });
  console.log((falta.length ? 'DIFF ' : 'OK   ') + id + (falta.length ? '  faltan: ' + falta.slice(0, 3).join(' | ') : ''));
}

const abrirCompartir = async (L) => {
  await L.goto(WEB + '/archivos'); await L.waitForLoadState('networkidle');
  await L.getByRole('row').filter({ hasText: 'informe-demo' }).getByRole('button').last().click();
  await L.getByRole('menuitem', { name: /compartir/i }).click(); await L.waitForTimeout(1500);
  return L.getByRole('dialog').first();
};
const CP = 'sharing/compartir/compartir--', EP = 'sharing/enlace-publico/enlace-publico--';

const ses = { lucia: await sesion('lucia') };
const NO_ENLACE = !(SOLO.includes('enlace') || SOLO.includes('visitante'));
if (SOLO.includes('enlace') || SOLO.includes('visitante')) {
  const cl = await nuevoCtx(ses.lucia); const L = await cl.newPage();
  await cl.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB });
  let dlg = await abrirCompartir(L);
  if (/Revocar enlace/.test(await dlg.innerText())) { // dejar el archivo sin enlace
    await dlg.getByRole('button', { name: 'Revocar enlace' }).click(); await dlg.getByRole('button', { name: /^Revocar/ }).last().click(); await L.waitForTimeout(2500);
  }
  await snap('enlace-sin-enlace', CP + 'enlace-sin-enlace', L, dlg);
  await dlg.getByRole('button', { name: 'Crear enlace público' }).click(); await snap('enlace-formulario', CP + 'enlace-formulario', L, dlg);
  await dlg.getByLabel(/Contraseña/).fill('abc'); await dlg.getByRole('button', { name: 'Generar enlace' }).click(); await L.waitForTimeout(800);
  await snap('enlace-contrasena-invalida', CP + 'enlace-contrasena-invalida', L, dlg);
  await dlg.getByLabel(/Contraseña/).fill('Clave-Demo-1'); await dlg.getByRole('button', { name: 'Generar enlace' }).click(); await L.waitForTimeout(3000);
  await snap('enlace-generado', CP + 'enlace-generado', L, dlg);
  const url1 = await dlg.locator('input[readonly]').first().inputValue();
  await dlg.getByRole('button', { name: /Copiar enlace/ }).click(); await L.waitForTimeout(500);
  await snap('enlace-copiado', CP + 'enlace-copiado', L, dlg);
  if (SOLO.includes('visitante')) {
    const cv = await nuevoCtx(); const V = await cv.newPage();
    await V.goto(url1.replace(WEB, PUB)); await V.waitForLoadState('networkidle'); await V.waitForTimeout(2000);
    await snap('visitante-con-contrasena', EP + 'con-contrasena', V);
    await V.getByLabel('Contraseña del enlace').fill('mala-mala-1'); await V.getByRole('button', { name: 'Descargar' }).click(); await V.waitForTimeout(2000);
    await snap('visitante-contrasena-incorrecta', EP + 'contrasena-incorrecta', V);
    for (let i = 0; i < 8; i++) { await V.getByLabel('Contraseña del enlace').fill('mala-' + i + '-xx'); await V.getByRole('button', { name: 'Descargar' }).click(); await V.waitForTimeout(600); if (/demasiados/i.test(await V.locator('body').innerText())) break; }
    await snap('visitante-bloqueado', EP + 'bloqueado', V); await cv.close();
  }
  dlg = await abrirCompartir(L);
  await snap('enlace-activo', CP + 'enlace-activo', L, dlg);
  await dlg.getByRole('button', { name: 'Generar otro enlace' }).click(); await L.waitForTimeout(500);
  await snap('enlace-confirmar-reemplazo', CP + 'enlace-confirmar-reemplazo', L, dlg);
  await dlg.getByRole('button', { name: /^Generar (otro )?enlace/ }).last().click(); await L.waitForTimeout(3000);
  const url2 = await dlg.locator('input[readonly]').first().inputValue();
  if (SOLO.includes('visitante')) {
    const cv = await nuevoCtx(); const V = await cv.newPage();
    await V.goto(url2.replace(WEB, PUB)); await V.waitForLoadState('networkidle'); await V.waitForTimeout(2000);
    await snap('visitante-sin-contrasena', EP + 'sin-contrasena', V);
    await Promise.all([V.waitForEvent('download', { timeout: 20000 }).catch(() => null), V.getByRole('button', { name: 'Descargar' }).click()]); await V.waitForTimeout(1500);
    await snap('visitante-descarga-iniciada', EP + 'descarga-iniciada', V); await cv.close();
  }
  dlg = await abrirCompartir(L);
  await dlg.getByRole('button', { name: 'Revocar enlace' }).click(); await L.waitForTimeout(500);
  await snap('enlace-confirmar-revocar', CP + 'enlace-confirmar-revocar', L, dlg);
  await dlg.getByRole('button', { name: /^Revocar/ }).last().click(); await L.waitForTimeout(2500);
  await snap('enlace-revocado', CP + 'enlace-revocado', L, dlg);
  if (SOLO.includes('visitante')) {
    const cv = await nuevoCtx(); const V = await cv.newPage(); await V.goto(url2.replace(WEB, PUB)); await V.waitForLoadState('networkidle'); await V.waitForTimeout(2500);
    await snap('visitante-no-disponible', EP + 'no-disponible', V); await cv.close();
  }
  await cl.storageState({ path: `${SES}lucia.json` }); await cl.close();
}

// ── editor y compartidos conmigo ────────────────────────────────────────────────
const ID_L = '8940d7e2-6687-494f-80f1-f47f2b6b3e60', ID_C = '039b2f48-c3d0-4953-a6ec-a105bf915c9b';
const ED = 'editing/editor/editor--', CC = 'sharing/compartidos-conmigo/compartidos-conmigo--';
if (SOLO.includes('editor') || SOLO.includes('compartidos')) {
  const cl = await nuevoCtx(await sesion('lucia')), cd = await nuevoCtx(await sesion('diego')), cc = await nuevoCtx(await sesion('carla'));
  const L = await cl.newPage(), D = await cd.newPage(), C = await cc.newPage();
  const nivel = async (valor) => { const dlg = await abrirCompartir(L); await dlg.locator('select').last().selectOption({ label: valor }); await L.waitForTimeout(2500); await L.keyboard.press('Escape'); };
  if (SOLO.includes('editor')) {
    await nivel('Editor');
    await L.goto(`${WEB}/editor/${ID_L}`); await L.waitForTimeout(13000);
    await D.goto(`${WEB}/editor/${ID_L}`); await D.waitForTimeout(15000); await L.waitForTimeout(3000);
    await snap('editor-coeditando', ED + 'coeditando', L);
    await D.goto(WEB + '/archivos'); await L.goto(WEB + '/archivos');
    await C.goto(`${WEB}/editor/${ID_C}`); await C.waitForTimeout(10000);
    await snap('editor-solo-lectura-plan', ED + 'solo-lectura-plan', C);
    await nivel('Lector');
    await D.goto(`${WEB}/editor/${ID_L}`); await D.waitForTimeout(12000);
    await snap('editor-solo-lectura-lector', ED + 'solo-lectura-lector', D);
  } else await nivel('Lector');
  if (SOLO.includes('compartidos')) {
    await D.goto(WEB + '/compartidos'); await D.waitForLoadState('networkidle'); await D.waitForTimeout(1500);
    await snap('compartidos-con-elementos', CC + 'con-elementos', D);
    await D.getByRole('row').filter({ hasText: 'informe-demo' }).getByRole('button').last().click().catch(() => D.getByRole('button', { name: /acciones|más/i }).last().click());
    await D.waitForTimeout(500); await snap('compartidos-menu-fila', CC + 'menu-fila', D);
    await D.getByRole('menuitem', { name: /salir/i }).click(); await D.waitForTimeout(600);
    await snap('compartidos-confirmar-salir', CC + 'confirmar-salir', D);
    await D.keyboard.press('Escape');
    await C.goto(WEB + '/compartidos'); await C.waitForLoadState('networkidle'); await C.waitForTimeout(1500);
    await snap('compartidos-vacia', CC + 'vacia', C);
  }
  if (SOLO.includes('editor')) {
    execSync('docker stop nimbo-onlyoffice-1');
    try { await L.goto(`${WEB}/editor/${ID_L}`); await L.waitForTimeout(15000); await snap('editor-no-disponible', ED + 'no-disponible', L); }
    finally { execSync('docker start nimbo-onlyoffice-1'); }
  }
  await cl.close(); await cd.close(); await cc.close();
}

// ── informe ─────────────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const img = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const filas = resultados.map((r) => `<section><h2>${r.id} <small>${r.falta.length ? `· ${r.falta.length} textos del mockup no aparecen` : '· textos coinciden'}</small></h2>
<div class="par"><figure><figcaption>Real</figcaption><img src="${img(OUT + r.png)}"></figure>${fs.existsSync(r.capt) ? `<figure><figcaption>Mockup aprobado</figcaption><img src="${img(r.capt)}"></figure>` : '<p>Sin captura aprobada</p>'}</div>
${r.falta.length ? `<ul>${r.falta.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}</section>`).join('\n');
fs.writeFileSync(OUT + `informe-${ANCHO}.html`, `<!doctype html><meta charset=utf-8><title>Real vs mockup (${ANCHO}px)</title><style>body{font:14px system-ui;margin:24px;background:#f4f6fa}section{background:#fff;padding:16px;margin:0 0 20px;border-radius:8px}h2 small{color:#667;font-weight:400}.par{display:flex;gap:16px;align-items:flex-start}figure{margin:0;flex:1}img{max-width:100%;border:1px solid #ccd}figcaption{font-weight:600;margin-bottom:6px}li{color:#a33}</style><h1>Real vs mockup aprobado · ${ANCHO}px</h1>${filas}`);
console.log(`\nInforme: ${OUT}informe-${ANCHO}.html  (${resultados.length} estados, ${resultados.filter((r) => r.falta.length).length} con diferencias de texto)`);
await b.close();
