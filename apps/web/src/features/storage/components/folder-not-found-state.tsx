import { Folder, FolderX, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { buttonVariants } from '../../../components/ui/button';
import { MY_FILES_PATH, TRASH_PATH } from '../routes';

/**
 * Carpeta inexistente, ajena o en la papelera (CA-5): el mismo texto para todas, para no revelar nada (CA-22). Es un
 * vacío, no un error del sistema, y tiene su propio `h1` (mockup `carpeta-no-encontrada`).
 */
export function FolderNotFoundState(): React.JSX.Element {
  return (
    <section
      aria-labelledby="carpeta-no-encontrada"
      className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-sm"
    >
      <FolderX className="mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h1 id="carpeta-no-encontrada" className="text-lg font-semibold text-foreground">
        No encontramos esta carpeta
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Puede que la hayas movido a la papelera o que el enlace ya no sea válido.
      </p>
      <div className="mt-5 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
        <Link href={MY_FILES_PATH} className={buttonVariants()}>
          <Folder className="h-4 w-4" aria-hidden="true" />
          Ir a Mis archivos
        </Link>
        <Link href={TRASH_PATH} className={buttonVariants({ variant: 'outline' })}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Ver papelera
        </Link>
      </div>
    </section>
  );
}
