import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Raíz de `apps/web`: aquí viven `next.config.ts` y, si algún día existe, `middleware.ts`. */
const WEB_ROOT = resolve(__dirname, '../..');
const APP_DIR = __dirname;

const PUBLIC_LINKS = /public-links/;
const REWRITES = /\brewrites\b/;

/** Manejadores de ruta de Next (`route.ts`, `route.js`…) dentro de `src/app`. */
const ROUTE_HANDLER = /(^|[\\/])route\.(ts|tsx|js|mjs)$/;
/** Un manejador que llama a la API (o a cualquier sitio) es un proxy en potencia, aunque no nombre /public-links. */
const CALLS_UPSTREAM = /\bfetch\s*\(|\bAPI_(PUBLIC_)?URL\b/;
/** Segmento catch-all (`[...x]` o `[[...x]]`) en cualquier nivel de `src/app/api`. */
const API_CATCH_ALL = /^api[\\/](.*[\\/])?\[\[?\.\.\.[^\]]+\]\]?([\\/]|$)/;
/** Rutas de API del Pages Router: la web no las usa. */
const PAGES_API_DIRS = ['src/pages/api', 'pages/api'];
const MIDDLEWARE_FILES = [
  'middleware.ts',
  'middleware.js',
  'src/middleware.ts',
  'src/middleware.js',
];

/** El cliente del visitante: prueba que el patrón sí encuentra la ruta (la prueba no es vacía). */
const VISITOR_CLIENT = 'src/features/sharing/public-link-visitor-api.ts';

const sourceOf = (path: string): string => readFileSync(path, 'utf8');

const filesUnder = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: 'utf8' }) : [];

const routeHandlers = (): string[] =>
  filesUnder(APP_DIR)
    .filter((path) => ROUTE_HANDLER.test(path))
    .map((path) => join(APP_DIR, path));

const existingMiddleware = (): string[] =>
  MIDDLEWARE_FILES.map((path) => join(WEB_ROOT, path)).filter((path) => existsSync(path));

describe('arquitectura de web: nada reenvía /public-links (013b CA-9, SEC-6 de 013)', () => {
  it('CA-9: ningún manejador de ruta de `src/app` toca /public-links', () => {
    const offenders = routeHandlers().filter((path) => PUBLIC_LINKS.test(sourceOf(path)));

    expect(offenders).toEqual([]);
  });

  it('CA-9: ningún manejador de ruta de `src/app` hace `fetch` ni usa API_URL o API_PUBLIC_URL', () => {
    const offenders = routeHandlers().filter((path) => CALLS_UPSTREAM.test(sourceOf(path)));

    expect(offenders).toEqual([]);
  });

  it('CA-9: no hay rutas catch-all bajo `src/app/api`', () => {
    const offenders = filesUnder(APP_DIR).filter((path) => API_CATCH_ALL.test(path));

    expect(offenders).toEqual([]);
  });

  it('CA-9: no hay rutas de API del Pages Router (`src/pages/api` ni `pages/api`)', () => {
    const offenders = PAGES_API_DIRS.flatMap((dir) => filesUnder(join(WEB_ROOT, dir)));

    expect(offenders).toEqual([]);
  });

  it('CA-9: `next.config.ts` no declara `rewrites` ni menciona /public-links', () => {
    const config = sourceOf(join(WEB_ROOT, 'next.config.ts'));

    expect(config).not.toMatch(REWRITES);
    expect(config).not.toMatch(PUBLIC_LINKS);
  });

  it('CA-9: ningún `middleware` reenvía /public-links', () => {
    const offenders = existingMiddleware().filter((path) => PUBLIC_LINKS.test(sourceOf(path)));

    expect(offenders).toEqual([]);
  });

  it('CA-9: el cliente del visitante sí llama a /public-links desde el navegador (la prueba no es vacía)', () => {
    const client = sourceOf(join(WEB_ROOT, VISITOR_CLIENT));

    expect(client).toMatch(PUBLIC_LINKS);
    expect(client).not.toMatch(/^['"]use server['"]/m);
  });
});
