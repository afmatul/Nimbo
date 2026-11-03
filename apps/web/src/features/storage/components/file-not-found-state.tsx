import { FileX, Folder } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { buttonVariants } from '../../../components/ui/button';
import { MY_FILES_PATH } from '../routes';

/** Archivo en la papelera, inexistente o ajeno (014 CA-16, CA-17): el mismo texto para todos, para no revelar cuál es. */
export function FileNotFoundState(): React.JSX.Element {
  return (
    <section
      aria-labelledby="archivo-no-encontrado"
      className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-sm"
    >
      <FileX className="mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h1 id="archivo-no-encontrado" className="text-lg font-semibold text-foreground">
        No encontramos este archivo.
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Puede que lo hayas movido a la papelera o que ya no exista.
      </p>
      <Link href={MY_FILES_PATH} className={buttonVariants({ className: 'mt-5' })}>
        <Folder className="h-4 w-4" aria-hidden="true" />
        Ir a Mis archivos
      </Link>
    </section>
  );
}
