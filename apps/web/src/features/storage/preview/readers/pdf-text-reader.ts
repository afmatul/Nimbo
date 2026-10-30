import type * as PdfJs from 'pdfjs-dist';

export type PdfTextContent = Awaited<ReturnType<PdfJs.PDFPageProxy['getTextContent']>>;
type PdfTextOptions = {
  readonly engine: typeof PdfJs;
  readonly source: ReadableStream<PdfTextContent>;
  readonly overlay: HTMLElement;
  readonly literal: HTMLElement;
  readonly viewport: PdfJs.PageViewport;
};
export type PdfTextReading = {
  readonly promise: Promise<void>;
  readonly cancel: () => Promise<void>;
};

function appendLiteral(content: PdfTextContent, container: HTMLElement): void {
  const block = container.ownerDocument.createElement('p');
  block.className = 'whitespace-pre-wrap break-words';
  block.textContent = content.items
    .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ''}` : ''))
    .join('');
  if (block.textContent.length > 0) container.append(block);
}

async function readLiteral(
  reader: ReadableStreamDefaultReader<PdfTextContent>,
  literal: HTMLElement,
  active: () => boolean,
): Promise<void> {
  try {
    for (;;) {
      const chunk = await reader.read();
      if (!active() || chunk.done) return;
      appendLiteral(chunk.value, literal);
    }
  } finally {
    reader.releaseLock();
  }
}

function scaleOverlay({ overlay, viewport }: PdfTextOptions): void {
  overlay.style.setProperty(
    '--total-scale-factor',
    String(viewport.scale * (viewport.userUnit ?? 1)),
  );
}

function createLayer(options: PdfTextOptions, source: ReadableStream) {
  const layer = new options.engine.TextLayer({
    textContentSource: source,
    container: options.overlay,
    viewport: options.viewport,
  });
  scaleOverlay(options);
  return layer;
}

function clearText({ overlay, literal }: PdfTextOptions): void {
  overlay.replaceChildren();
  literal.replaceChildren();
}

/** La proyección literal consume todo el stream, incluso si TextLayer limita sus textDivs. */
export function renderPdfText(options: PdfTextOptions): PdfTextReading {
  const [layout, literal] = options.source.tee();
  const reader = literal.getReader();
  const layer = createLayer(options, layout);
  let active = true;
  let cleanup: Promise<void> | undefined;
  const promise = Promise.all([layer.render(), readLiteral(reader, options.literal, () => active)])
    .then(() => undefined)
    .catch((error: unknown) => {
      if (active) throw error;
    });
  return {
    promise,
    cancel: () => {
      if (cleanup !== undefined) return cleanup;
      active = false;
      layer.cancel();
      cleanup = Promise.allSettled([
        reader.cancel().catch(() => undefined),
        layout.cancel().catch(() => undefined),
        promise,
      ]).then(() => clearText(options));
      return cleanup;
    },
  };
}
