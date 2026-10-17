/**
 * @jest-environment jsdom
 */
import { loadDocsApi } from './load-docs-api';

const FAKE_DOCS_API = { DocEditor: jest.fn() };

function scripts(): HTMLScriptElement[] {
  return Array.from(document.head.querySelectorAll('script'));
}

describe('loadDocsApi (script de ONLYOFFICE)', () => {
  afterEach(() => {
    document.head.replaceChildren();
    delete (window as { DocsAPI?: unknown }).DocsAPI;
  });

  it('CA-1: carga el script del servidor de documentos que dio la API y entrega `DocsAPI`', async () => {
    const loading = loadDocsApi('https://docs.nimbo.local/editor/');
    const [script] = scripts();

    expect(script?.src).toBe('https://docs.nimbo.local/editor/web-apps/apps/api/documents/api.js');
    (window as { DocsAPI?: unknown }).DocsAPI = FAKE_DOCS_API;
    script?.dispatchEvent(new Event('load'));

    await expect(loading).resolves.toBe(FAKE_DOCS_API);
  });

  it('reutiliza el script ya cargado del mismo servidor', async () => {
    const first = loadDocsApi('https://docs-a.nimbo.local');
    (window as { DocsAPI?: unknown }).DocsAPI = FAKE_DOCS_API;
    scripts()[0]?.dispatchEvent(new Event('load'));
    await first;

    await expect(loadDocsApi('https://docs-a.nimbo.local')).resolves.toBe(FAKE_DOCS_API);
    expect(scripts()).toHaveLength(1);
  });

  it('CA-15: si el script no carga, rechaza, lo quita y el próximo intento lo vuelve a pedir', async () => {
    const failed = loadDocsApi('https://docs-b.nimbo.local');
    scripts()[0]?.dispatchEvent(new Event('error'));
    await expect(failed).rejects.toThrow();
    expect(scripts()).toHaveLength(0);

    void loadDocsApi('https://docs-b.nimbo.local').catch(() => undefined);
    expect(scripts()).toHaveLength(1);
  });

  it('CA-15: si el script carga sin `DocsAPI`, rechaza', async () => {
    const loading = loadDocsApi('https://docs-c.nimbo.local');
    scripts()[0]?.dispatchEvent(new Event('load'));

    await expect(loading).rejects.toThrow();
  });
});
