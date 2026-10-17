'use client';

import { FileSearch, SearchX } from 'lucide-react';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { ForbiddenState } from '../../access/components/forbidden-state';
import { useClientFiles, type ClientFiles, type LoadClientFiles } from '../hooks/use-client-files';
import { useSessionClientFilesLoad } from '../hooks/use-session-client-files-load';

import { ClientFileSearch } from './client-file-search';
import { ClientFilesOutcome, PrivacyNotice } from './client-files-result';

const SUPPORT_PRIVACY =
  'Soporte ve metadatos de los archivos (nombre, tipo, tamaño, fechas y estado), nunca su contenido ni vistas previas.';

/** Antes de buscar (mockup `inicial`): qué verá y que la consulta se audita, sin botón (la búsqueda está arriba). */
function InitialState(): React.JSX.Element {
  return (
    <StateView
      type="empty"
      headingLevel="h2"
      icon={FileSearch}
      className="mt-4"
      title="Busca a un cliente para ver sus archivos"
      description="Verás el nombre, tipo, tamaño, fechas y estado de cada archivo, nunca su contenido. Cada consulta queda en la auditoría del cliente, que ve tu rol."
    />
  );
}

/** El mismo texto si el correo no existe o es de una cuenta interna (003 D-6); sin aviso de auditoría. */
function NotFoundSearch({
  email,
  onClear,
}: {
  readonly email: string;
  readonly onClear: () => void;
}): React.JSX.Element {
  return (
    <StateView
      type="empty"
      role="status"
      headingLevel="h2"
      icon={SearchX}
      className="mt-4"
      title={`No encontramos una cuenta de cliente con «${email}».`}
      description="Revisa que el correo esté completo y bien escrito, o pídele al cliente el correo con el que inicia sesión."
      action={{ label: 'Limpiar búsqueda', onClick: onClear, variant: 'outline' }}
    />
  );
}

/** «Limpiar búsqueda» vacía el campo (lo vuelve a montar) y le devuelve el foco: el botón que lo pidió desaparece. */
function useClearableSearch(files: ClientFiles) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [clears, setClears] = React.useState(0);
  React.useEffect(() => {
    if (clears > 0) inputRef.current?.focus();
  }, [clears]);
  const clear = (): void => {
    files.clear();
    setClears((previous) => previous + 1);
  };
  return { inputRef, formKey: clears, clear };
}

function SearchResult({
  files,
  onClear,
}: {
  readonly files: ClientFiles;
  readonly onClear: () => void;
}): React.JSX.Element {
  const { state } = files;
  if (state.status === 'idle') return <InitialState />;
  if (state.status === 'notFound') return <NotFoundSearch email={state.email} onClear={onClear} />;
  return <ClientFilesOutcome files={files} />;
}

/**
 * Metadatos de los archivos de un cliente para Soporte (011 HU-5, CA-13, CA-17; mockup `backoffice/soporte`): buscar por
 * correo exacto y ver nombre, tipo, tamaño, fechas y estado, nunca contenido. Cada consulta se audita (RN-2).
 */
export function SupportClientFiles({
  load,
}: {
  readonly load: LoadClientFiles;
}): React.JSX.Element {
  const files = useClientFiles(load);
  const search = useClearableSearch(files);
  // Un 403 (interno ya no activo, CA-14) es la pantalla común «sin permiso» (003 D-8), no un estado de la búsqueda.
  if (files.state.status === 'forbidden') return <ForbiddenState role="SUPPORT" />;
  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-semibold text-foreground">Metadatos de archivos</h1>
      <p className="mt-1 text-sm text-secondary-foreground">
        Busca a un cliente por su correo para revisar el estado de sus archivos.
      </p>
      <PrivacyNotice text={SUPPORT_PRIVACY} />
      <ClientFileSearch key={search.formKey} onSearch={files.search} inputRef={search.inputRef} />
      <SearchResult files={files} onClear={search.clear} />
    </div>
  );
}

/** La pantalla de Soporte conectada a la API con la sesión en memoria (002). */
export function SessionSupportClientFiles({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  return <SupportClientFiles load={useSessionClientFilesLoad(apiPublicUrl)} />;
}
