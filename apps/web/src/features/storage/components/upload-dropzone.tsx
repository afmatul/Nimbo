'use client';

import { Upload } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../../lib/utils';

export interface UploadDropzoneProps {
  /** Máximo por archivo formateado; sin él, el aviso de arrastre omite la cifra. */
  readonly maxFileLabel?: string | undefined;
  /** Archivos elegidos o soltados, en orden; nunca se llama con una lista vacía. */
  readonly onFiles: (files: readonly File[]) => void;
  readonly inputRef?: React.Ref<HTMLInputElement>;
  readonly className?: string;
  readonly children?: React.ReactNode;
}

/** Zona que acepta archivos soltados o elegidos; muestra «Suelta para subir» mientras se arrastra encima. */
export function UploadDropzone({
  maxFileLabel,
  onFiles,
  inputRef,
  className,
  children,
}: UploadDropzoneProps): React.JSX.Element {
  const [isDragging, setIsDragging] = React.useState(false);
  const dragDepth = React.useRef(0);

  const deliver = (files: ArrayLike<File> | null | undefined): void => {
    if (files && files.length > 0) onFiles(Array.from(files));
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    deliver(event.dataTransfer?.files);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    deliver(event.target.files);
    event.target.value = '';
  };

  return (
    <div
      data-testid="upload-dropzone"
      className={cn('relative', className)}
      onDragEnter={handleDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Elegir archivos para subir"
        onChange={handleChange}
      />
      {children}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center rounded-lg border-[1.5px] border-dashed border-brand bg-brand/5 p-4">
          <div
            role="status"
            className="flex max-w-full flex-col items-center gap-1 rounded-lg bg-primary px-4 py-3 text-center text-primary-foreground shadow-md"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Upload className="h-4 w-4" aria-hidden="true" />
              Suelta para subir
            </p>
            <p className="text-xs">
              {maxFileLabel === undefined
                ? 'Se guardarán en Mis archivos'
                : `Se guardarán en Mis archivos · hasta ${maxFileLabel} por archivo`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
