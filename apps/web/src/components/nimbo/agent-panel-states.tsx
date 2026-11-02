import { FileClock, FileText, Info, Sparkles, Upload } from 'lucide-react';
import type * as React from 'react';

import { Alert } from '../ui/alert';
import { Button } from '../ui/button';

/** Formatos que indexa la 019 (020b S-2): el estado vacío los lista tal cual. */
const INDEXED_FORMATS: readonly (readonly [extension: string, detail: string])[] = [
  ['.docx', 'Word'],
  ['.pdf', 'con texto'],
  ['.txt', ''],
  ['.md', ''],
  ['.xlsx', 'Excel'],
  ['.pptx', 'PowerPoint'],
];

/** `inicio`: hay archivos indexados y aún no hay preguntas. */
export function AgentIntro(): React.JSX.Element {
  return (
    <div className="my-auto flex flex-col items-center py-6 text-center">
      <Sparkles className="mb-3.5 h-10 w-10 text-agent-accent" aria-hidden="true" />
      <h3 className="text-base font-semibold">Pregunta sobre tus documentos</h3>
      <p className="mt-1.5 max-w-xs text-sm leading-6">
        Escribe una pregunta y te responderé con lo que dicen tus archivos, citando el archivo y el
        lugar exacto.
      </p>
    </div>
  );
}

function IndexedFormats(): React.JSX.Element {
  return (
    <ul aria-label="Formatos que se indexan" className="mt-4 flex flex-wrap justify-center gap-2">
      {INDEXED_FORMATS.map(([extension, detail]) => (
        <li
          key={extension}
          className="inline-flex min-h-7 items-center gap-1.5 rounded-sm bg-agent-tag px-2.5 py-0.5 text-xs"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          <strong className="font-semibold">{extension}</strong>
          {detail !== '' && ` ${detail}`}
        </li>
      ))}
    </ul>
  );
}

/** `vacio` (CA-2): sin archivos indexados, qué formatos se indexan y «Subir archivos». El campo sigue activo (S-4). */
export function AgentEmptyState({
  onUploadFiles,
}: {
  readonly onUploadFiles: () => void;
}): React.JSX.Element {
  return (
    <div className="my-auto flex flex-col items-center py-6 text-center">
      <FileClock className="mb-3.5 h-10 w-10 text-agent-accent" aria-hidden="true" />
      <h3 className="text-base font-semibold">Aún no hay archivos que consultar</h3>
      <p className="mt-1.5 max-w-xs text-sm leading-6">
        El agente responde con lo que dicen tus documentos. Cuando subas archivos de estos formatos
        y terminen de prepararse, podrás preguntarles aquí.
      </p>
      <IndexedFormats />
      <p className="mt-3 max-w-xs text-sm leading-6">
        Los PDF escaneados (solo imagen) y las imágenes no se indexan.
      </p>
      <Button className="mt-4.5 w-full sm:w-auto" onClick={onUploadFiles}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        Subir archivos
      </Button>
    </div>
  );
}

/** `sin-resultados` (CA-5): la respuesta ya dice «No encontré…»; aquí, la pista y que contó como consulta. */
export function NotFoundNotice(): React.JSX.Element {
  return (
    <div className="grid gap-3">
      <p className="text-sm leading-6">
        Prueba con otras palabras o amplía el ámbito a todos tus archivos.
      </p>
      <Alert variant="info" className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-semibold">Esta respuesta cuenta como una consulta</p>
          <p>Se usó una de tus consultas de este mes aunque no haya fuentes.</p>
        </div>
      </Alert>
    </div>
  );
}
