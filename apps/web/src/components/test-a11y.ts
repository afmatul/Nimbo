import { axe, toHaveNoViolations } from 'jest-axe';
import { JSDOM } from 'jsdom';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

expect.extend(toHaveNoViolations);

/** Audita el HTML estático. El Jest de `web` corre en Node y no tiene DOM global. */
export async function expectNoA11yViolations(jsx: ReactNode): Promise<void> {
  const html = `<!DOCTYPE html><html lang="es"><head><title>A11y</title></head><body><main>${renderToStaticMarkup(jsx)}</main></body></html>`;
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const globalAny = global as unknown as Record<string, unknown>;
  globalAny['window'] = dom.window;
  globalAny['document'] = dom.window.document;
  globalAny['Node'] = dom.window.Node;
  globalAny['Element'] = dom.window.Element;
  globalAny['HTMLElement'] = dom.window.HTMLElement;

  const results = await axe(dom.window.document.body);
  expect(results).toHaveNoViolations();
}
