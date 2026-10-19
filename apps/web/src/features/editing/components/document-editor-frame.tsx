'use client';

import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { loadDocsApi, type DocEditorInstance } from '../onlyoffice/load-docs-api';

export interface DocumentEditorFrameProps {
  readonly documentServerUrl: string;
  /** Configuración firmada por el servidor: se entrega tal cual a ONLYOFFICE (plan §4). */
  readonly config: Readonly<Record<string, unknown>>;
  /** El script no cargó: el servicio de edición no responde (CA-15). */
  readonly onUnavailable: () => void;
}

export const LOADING_EDITOR_TITLE = 'Abriendo el editor…';

/** Monta ONLYOFFICE en un nodo propio de `wrapper` (React no lo administra) y devuelve cómo desmontarlo. */
function mountEditor(
  wrapper: HTMLElement,
  props: DocumentEditorFrameProps & { readonly elementId: string; readonly onMounted: () => void },
): () => void {
  let editor: DocEditorInstance | null = null;
  let active = true;
  const placeholder = document.createElement('div');
  placeholder.id = props.elementId;
  wrapper.appendChild(placeholder);
  loadDocsApi(props.documentServerUrl).then(
    (docsApi) => {
      if (!active) return;
      editor = new docsApi.DocEditor(props.elementId, props.config);
      props.onMounted();
    },
    () => active && props.onUnavailable(),
  );
  return () => {
    active = false;
    editor?.destroyEditor();
    wrapper.replaceChildren();
  };
}

/**
 * ONLYOFFICE monta su `iframe` en un nodo que React no administra: se crea aquí, se le pasa su id y se limpia al salir
 * (el editor se destruye). Mientras llega el script se anuncia la carga (RNF-14).
 */
export function DocumentEditorFrame({
  documentServerUrl,
  config,
  onUnavailable,
}: DocumentEditorFrameProps): React.JSX.Element {
  const host = React.useRef<HTMLDivElement>(null);
  const elementId = `onlyoffice-${React.useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    if (host.current === null) return undefined;
    const onMounted = (): void => setMounted(true);
    return mountEditor(host.current, {
      documentServerUrl,
      config,
      onUnavailable,
      elementId,
      onMounted,
    });
  }, [documentServerUrl, config, onUnavailable, elementId]);

  return (
    <div className="relative flex min-h-96 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {mounted ? null : (
        <StateView
          type="loading"
          title={LOADING_EDITOR_TITLE}
          className="absolute inset-0 z-10 rounded-none border-0"
        />
      )}
      <div ref={host} className="flex flex-1 flex-col" />
    </div>
  );
}
