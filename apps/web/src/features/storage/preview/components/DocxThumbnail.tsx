'use client';

import { fileThumbnailResponseSchema, type FileSummary } from '@nimbo/contracts';
import * as React from 'react';

import { useAuthFetch } from '../../../identity/session/use-auth-fetch';

import { useNearViewport } from './FileThumbnail';

type LoaderProps = { readonly file: FileSummary; readonly apiPublicUrl: string };

/** Extracto de texto del `.docx` (`GET /files/:id/thumbnail`); `null` mientras llega o si no hay texto ni respuesta. */
function useDocxExcerpt({ file, apiPublicUrl }: LoaderProps, enabled: boolean): string | null {
  const authFetch = useAuthFetch();
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const base = apiPublicUrl.replace(/\/$/, '');
    authFetch(`${base}/files/${encodeURIComponent(file.id)}/thumbnail`, {
      signal: controller.signal,
    })
      .then((raw) => {
        const parsed = fileThumbnailResponseSchema.safeParse(raw);
        if (parsed.success && !controller.signal.aborted) setText(parsed.data.text);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, file.id, apiPublicUrl, authFetch]);
  return text;
}

/**
 * Miniatura de un `.docx`: las primeras líneas de su texto sobre una hoja, pedidas al servidor (que las extrae una vez
 * por versión, sin auditoría) cuando la tarjeta está cerca de la pantalla. Decorativa: sin texto, la tarjeta conserva
 * su hoja de renglones.
 */
export function DocxThumbnail(props: LoaderProps): React.JSX.Element {
  const [box, setBox] = React.useState<HTMLDivElement | null>(null);
  const text = useDocxExcerpt(props, useNearViewport(box));
  return (
    <div ref={setBox} aria-hidden="true" inert className="absolute inset-0 overflow-hidden">
      {text === null ? null : (
        <p className="absolute inset-x-5 bottom-0 top-3 overflow-hidden whitespace-pre-line rounded-t-sm border border-border bg-card p-2 text-[7px] leading-[9px] text-foreground shadow-sm">
          {text}
        </p>
      )}
    </div>
  );
}
