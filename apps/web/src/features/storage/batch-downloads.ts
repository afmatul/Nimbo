/** Pausa entre una descarga y la siguiente: el navegador no junta ni cancela navegaciones casi simultáneas. */
export const DOWNLOAD_STAGGER_MS = 400;
/** Tiempo que el `iframe` oculto queda en la página; la descarga ya pasó al gestor del navegador. */
export const DOWNLOAD_FRAME_TTL_MS = 60_000;

function openInHiddenFrame(url: string): void {
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.src = url;
  document.body.append(frame);
  window.setTimeout(() => frame.remove(), DOWNLOAD_FRAME_TTL_MS);
}

/**
 * Inicia varias descargas, una por URL prefirmada (MinIO responde `Content-Disposition: attachment`). Cada una va en
 * su `iframe` oculto y escalonada: varios `<a download>` seguidos no sirven (el atributo se ignora entre orígenes y el
 * navegador cancela las navegaciones anteriores, así que solo baja la última o ninguna).
 */
export function startDownloads(urls: readonly string[]): void {
  urls.forEach((url, index) => {
    window.setTimeout(() => openInHiddenFrame(url), index * DOWNLOAD_STAGGER_MS);
  });
}
