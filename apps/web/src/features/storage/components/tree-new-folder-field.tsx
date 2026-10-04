'use client';

import { FILE_NAME_MAX_LENGTH } from '@nimbo/contracts';
import { AlertCircle, Check, FolderPlus, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { cn } from '../../../lib/utils';

import { fieldIndent } from './move-folder-tree';

export interface TreeNewFolderFieldProps {
  readonly parentName: string;
  readonly level: number;
  /** Crea la carpeta; devuelve el error que va debajo del campo, o `null` si se creó (y el campo se cierra). */
  readonly onSubmit: (name: string) => Promise<string | null>;
  readonly onCancel: () => void;
}

/**
 * Campo en línea de «Nueva carpeta» dentro de «Mover a…» (mockups `mover-nueva-carpeta` y `…-error`). Enter o ✓ crean;
 * Esc (lo atiende el diálogo) o ✕ cancelan. No entra en el recorrido con flechas: se alcanza con Tab.
 */
export const TreeNewFolderField = React.forwardRef<HTMLInputElement, TreeNewFolderFieldProps>(
  ({ parentName, level, onSubmit, onCancel }, ref) => {
    const [name, setName] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);
    const [pending, setPending] = React.useState(false);
    const inputId = React.useId();
    const helpId = `${inputId}-ayuda`;
    const errorId = `${inputId}-error`;

    const submit = async (): Promise<void> => {
      if (pending) return;
      setPending(true);
      const failure = await onSubmit(name);
      if (failure === null) return;
      setError(failure);
      setPending(false);
    };

    return (
      <li
        role="treeitem"
        aria-level={level}
        aria-selected={false}
        aria-label={`Nueva carpeta en ${parentName}`}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={cn('flex items-start gap-2 py-1.5 pr-1 pl-2', fieldIndent(level))}>
          <FolderPlus className="mt-3 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <label htmlFor={inputId} className="sr-only">
                Nombre de la nueva carpeta
              </label>
              <Input
                ref={ref}
                id={inputId}
                autoComplete="off"
                maxLength={FILE_NAME_MAX_LENGTH}
                value={name}
                error={error !== null}
                aria-describedby={error === null ? helpId : `${helpId} ${errorId}`}
                className="min-w-0 sm:h-10"
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  void submit();
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Crear carpeta"
                className="shrink-0 text-primary sm:h-10 sm:w-10"
                loading={pending}
                onClick={() => void submit()}
              >
                {pending ? null : <Check className="h-5 w-5" aria-hidden="true" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cancelar la nueva carpeta"
                className="shrink-0 text-secondary-foreground sm:h-10 sm:w-10"
                onClick={onCancel}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
            <p id={helpId} className="mt-1 text-xs text-secondary-foreground">
              Se creará en {parentName}.
            </p>
            {error === null ? null : (
              <p
                id={errorId}
                role="alert"
                className="mt-1 flex items-start gap-1 text-xs font-medium text-destructive"
              >
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}
          </div>
        </div>
      </li>
    );
  },
);
TreeNewFolderField.displayName = 'TreeNewFolderField';
