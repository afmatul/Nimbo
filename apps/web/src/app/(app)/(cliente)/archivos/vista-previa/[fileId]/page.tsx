import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonVariants } from '../../../../../../components/ui/button';
import { returnPathOf } from '../../../../../../features/storage';

interface VistaPreviaPageProps {
  readonly params: Promise<{ readonly fileId: string }>;
}

/**
 * Marcador de la vista previa (017): T-06 lo reemplaza por el visor de `features/storage/preview`, que vuelve a
 * `file.folderId`. Sin datos del archivo, «Volver» abre la raíz y pide el foco de su fila (vuelta acotada, plan §2.5).
 */
export default async function VistaPreviaPage({
  params,
}: VistaPreviaPageProps): Promise<ReactNode> {
  const { fileId } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <section
        aria-labelledby="vista-previa-titulo"
        className="flex flex-col items-start gap-4 rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <h1
          id="vista-previa-titulo"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          Vista previa
        </h1>
        <p className="text-sm text-muted-foreground">La vista previa aún no está disponible.</p>
        <Link
          href={returnPathOf({ id: fileId, folderId: null })}
          className={buttonVariants({ variant: 'outline' })}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver
        </Link>
      </section>
    </main>
  );
}
