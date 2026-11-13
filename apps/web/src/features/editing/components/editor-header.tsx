'use client';

import type { EditMode } from '@nimbo/contracts';
import { ArrowLeft, Eye, Pencil } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { BrandLogo } from '../../../components/nimbo/brand-logo';
import { FileTypeChip } from '../../../components/nimbo/file-type-chip';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { MY_FILES_LABEL, MY_FILES_PATH } from '../../storage/routes';

/** Botón de la barra que despliega la presencia en móvil (en escritorio la lista siempre se ve). */
export interface PresenceToggle {
  readonly label: string;
  readonly controls: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

export interface EditorHeaderProps {
  readonly title: string;
  /** Sin modo mientras se abre o si no se pudo abrir. */
  readonly mode: EditMode | null;
  readonly presence: PresenceToggle | null;
}

/** Barra del editor (mockup `editing/editor`): el logo, que vuelve a Mis archivos, tipo, nombre, modo y, en móvil, la presencia. */
export function EditorHeader({ title, mode, presence }: EditorHeaderProps): React.JSX.Element {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
      <BrandLogo compact href={MY_FILES_PATH} label={`Volver a ${MY_FILES_LABEL}`} />
      <Link
        href={MY_FILES_PATH}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-secondary-foreground hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {MY_FILES_LABEL}
      </Link>
      <FileTypeChip fileType="docx" className="shrink-0" />
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{title}</h1>
      {mode ? <ModeBadge mode={mode} /> : null}
      {presence ? <PresenceToggleButton toggle={presence} /> : null}
    </header>
  );
}

/** «Editando» o «Solo lectura» con ícono, nunca solo color (mockup: `primary-hover` sobre `brand` al 12 %, 6.02). */
function ModeBadge({ mode }: { readonly mode: EditMode }): React.JSX.Element {
  const editing = mode === 'edit';
  const Icon = editing ? Pencil : Eye;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
        editing ? 'bg-brand/12 text-primary-hover' : 'bg-muted text-secondary-foreground',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {editing ? 'Editando' : 'Solo lectura'}
    </span>
  );
}

function PresenceToggleButton({ toggle }: { readonly toggle: PresenceToggle }): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full sm:w-auto lg:hidden"
      aria-expanded={toggle.expanded}
      aria-controls={toggle.controls}
      onClick={toggle.onToggle}
    >
      {toggle.label}
    </Button>
  );
}
