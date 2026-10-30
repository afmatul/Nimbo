import type { AgentCitationEvent } from '@nimbo/contracts';
import { CircleAlert, FileText } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { cn } from '../../lib/utils';

/** Lo que el chip necesita de un evento `citation` de la 020: archivo, etiqueta y certeza. */
export type CitationChipCitation = Pick<
  AgentCitationEvent,
  'fileId' | 'fileName' | 'label' | 'isCertain'
>;

export interface CitationChipProps {
  readonly citation: CitationChipCitation;
  readonly className?: string;
}

/**
 * Ficha del archivo con la ubicación citada (020b S-6). Solo la etiqueta va en la URL, nunca el nombre del archivo.
 * La ruta repite `fileDetailPath` de `storage` porque `components/nimbo` no importa de `features`; con 017 cambia
 * el destino, no el chip.
 */
function citationHref({ fileId, label }: CitationChipCitation): string {
  return `/archivos/archivo/${encodeURIComponent(fileId)}?ubicacion=${encodeURIComponent(label)}`;
}

/**
 * Cita documental del panel del agente (superficie `agent-bg`): «archivo · ubicación», navegable. Si falta espacio se
 * trunca el nombre del archivo, nunca la ubicación, que va siempre visible al final (CA-3). La etiqueta llega
 * del servidor ya en español y, si no es certera, con «(ubicación aproximada)» (020b S-5): no se reescribe. La cita
 * incierta se distingue también por ícono y borde discontinuo, no solo por color (CA-6).
 */
export function CitationChip({ citation, className }: CitationChipProps): React.JSX.Element {
  const Icon = citation.isCertain ? FileText : CircleAlert;
  return (
    <Link
      href={citationHref(citation)}
      aria-label={`Abrir ${citation.fileName}, ${citation.label}`}
      title={`${citation.fileName} · ${citation.label}`}
      className={cn(
        'mx-0.5 inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-sm border border-input bg-agent-tag px-2.5 py-0.5 align-middle text-xs font-medium text-agent-text no-underline hover:border-agent-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agent-accent focus-visible:ring-offset-1 focus-visible:ring-offset-agent-bg',
        !citation.isCertain && 'border-dashed border-agent-accent',
        className,
      )}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0 text-agent-accent"
        aria-hidden="true"
        data-icon={citation.isCertain ? 'certera' : 'aproximada'}
      />
      <span className="min-w-0 truncate font-semibold">{citation.fileName}</span>
      <span aria-hidden="true" className="shrink-0">
        ·
      </span>
      <span className="shrink-0 whitespace-nowrap tabular-nums">{citation.label}</span>
    </Link>
  );
}
