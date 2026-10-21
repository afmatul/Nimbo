/** Ruta del cliente de ONLYOFFICE Docs dentro del servidor de documentos (API de integración). */
const DOCS_API_PATH = '/web-apps/apps/api/documents/api.js';

/** Editor montado: se destruye al salir de la pantalla. */
export interface DocEditorInstance {
  destroyEditor(): void;
}

/** `window.DocsAPI` de ONLYOFFICE: monta el editor en el elemento con ese id y con la configuración firmada. */
export interface DocsApi {
  readonly DocEditor: new (
    elementId: string,
    config: Readonly<Record<string, unknown>>,
  ) => DocEditorInstance;
}

/** Un script por servidor; si falla, se olvida para que «Reintentar» lo vuelva a pedir (CA-15). */
const loading = new Map<string, Promise<DocsApi>>();

function docsApiOf(target: Window): DocsApi | undefined {
  return (target as Window & { DocsAPI?: DocsApi }).DocsAPI;
}

function injectScript(src: string): Promise<DocsApi> {
  return new Promise<DocsApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => {
      const api = docsApiOf(window);
      if (api) resolve(api);
      else reject(new Error('El servidor de documentos no expuso DocsAPI'));
    });
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error('No se pudo cargar el servidor de documentos'));
    });
    document.head.appendChild(script);
  });
}

/**
 * Carga el cliente de ONLYOFFICE desde el `documentServerUrl` que dio la API (plan 016 §1); nunca una URL escrita en
 * el frontend. Rechaza si el servicio no responde, y la pantalla lo muestra como «no disponible» (CA-15).
 */
export function loadDocsApi(documentServerUrl: string): Promise<DocsApi> {
  const src = `${documentServerUrl.replace(/\/$/, '')}${DOCS_API_PATH}`;
  const cached = loading.get(src);
  if (cached) return cached;
  const pending = injectScript(src);
  loading.set(src, pending);
  pending.catch(() => loading.delete(src));
  return pending;
}
