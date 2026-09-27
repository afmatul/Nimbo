import { AlertCircle, FolderOpen, Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

export type StateViewType = 'empty' | 'loading' | 'error';

export interface StateAction {
  readonly label: string;
  readonly onClick?: () => void;
  readonly variant?: 'default' | 'destructive' | 'outline' | 'secondary';
}

interface BaseStateViewProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly title: string;
  readonly description?: string;
  readonly icon?: React.ComponentType<{ className?: string }>;
}

export interface ErrorStateViewProps extends BaseStateViewProps {
  readonly type: 'error';
  readonly action: StateAction;
}

export interface NonErrorStateViewProps extends BaseStateViewProps {
  readonly type: 'empty' | 'loading';
  readonly action?: StateAction;
}

export type StateViewProps = ErrorStateViewProps | NonErrorStateViewProps;

/**
 * Componente transversal para estados de pantalla (vacío, carga y error).
 * En errores, garantiza la inclusión de una acción correctiva clara para el usuario (RNF-14).
 */
export function StateView({
  type,
  title,
  description,
  action,
  icon: CustomIcon,
  className,
  ...props
}: StateViewProps): React.JSX.Element {
  const isError = type === 'error';
  const isLoading = type === 'loading';
  const isEmpty = type === 'empty';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center bg-card shadow-sm min-h-56',
        isError && 'border-destructive/40 bg-destructive/5',
        className,
      )}
      role={isError ? 'alert' : isLoading ? 'status' : undefined}
      aria-live={isLoading ? 'polite' : undefined}
      {...props}
    >
      <div className="mb-4">
        {CustomIcon ? (
          <CustomIcon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        ) : isLoading ? (
          <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
        ) : isError ? (
          <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        ) : (
          <FolderOpen className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      <h3
        className={cn(
          'text-base font-semibold text-foreground tracking-tight',
          isError && 'text-destructive',
        )}
      >
        {title}
      </h3>

      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}

      {action && (
        <div className="mt-5">
          <Button
            variant={action.variant ?? (isError ? 'destructive' : isEmpty ? 'default' : 'outline')}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
