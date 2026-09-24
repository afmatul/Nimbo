import { Bookmark, HelpCircle } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export interface CitationChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly filename: string;
  readonly location?: string;
  readonly isCertain?: boolean;
}

/**
 * Chip de cita documental para el panel del agente IA de Nimbo.
 * Diseñado para la superficie oscura (`--agent-bg`), con texto accesible (`--agent-text`),
 * anillo de foco (`--agent-accent`) y aviso si la ubicación no es certera.
 */
export function CitationChip({
  filename,
  location,
  isCertain = true,
  className,
  ...props
}: CitationChipProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm bg-agent-tag px-2.5 py-1 text-xs font-medium text-agent-text transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agent-accent focus-visible:ring-offset-1 focus-visible:ring-offset-agent-bg',
        className,
      )}
      aria-label={`Cita de ${filename}${location ? ` en ${location}` : ''}${!isCertain ? ' (ubicación estimada)' : ''}`}
      {...props}
    >
      <Bookmark className="h-3.5 w-3.5 text-agent-accent shrink-0" aria-hidden="true" />
      <span className="font-semibold text-agent-text">{filename}</span>
      {location && (
        <>
          <span className="text-agent-text/60">·</span>
          <span className="text-agent-text/90 font-mono text-xs tabular-nums">{location}</span>
        </>
      )}
      {!isCertain && (
        <span
          className="inline-flex items-center gap-1 rounded bg-warning/20 px-1.5 py-0.5 text-xs text-warning font-normal"
          title="Ubicación estimada con menor certeza"
        >
          <HelpCircle className="h-2.5 w-2.5" aria-hidden="true" />
          <span>ubicación estimada</span>
        </span>
      )}
    </button>
  );
}
