'use client';

import type { FileSummary } from '@nimbo/contracts';
import type * as React from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog';
import { previewPathOf } from '../routes';

import { PreviewPage } from './PreviewPage';

export interface QuickLookDialogProps {
  /** Archivo a ver; `null` cierra el diálogo. */
  readonly file: FileSummary | null;
  readonly apiPublicUrl: string;
  readonly onClose: () => void;
}

/** Vista rápida: la misma vista previa de la 017, en un diálogo sobre el explorador y sin salir de la carpeta. */
export function QuickLookDialog({
  file,
  apiPublicUrl,
  onClose,
}: QuickLookDialogProps): React.JSX.Element {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto">
        <DialogHeader>
          <DialogTitle className="break-words">{file?.name ?? 'Vista previa'}</DialogTitle>
          <DialogDescription className="sr-only">
            Vista previa de solo lectura. Para verla completa abre{' '}
            {file ? previewPathOf(file.id) : ''}.
          </DialogDescription>
        </DialogHeader>
        {file === null ? null : (
          <PreviewPage fileId={file.id} apiPublicUrl={apiPublicUrl} embedded />
        )}
      </DialogContent>
    </Dialog>
  );
}
