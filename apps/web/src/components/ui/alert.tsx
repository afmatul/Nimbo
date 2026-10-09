import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const alertVariants = cva('rounded-md border px-4 py-3 text-sm', {
  variants: {
    variant: {
      error: 'border-destructive bg-card text-destructive',
      info: 'border-border bg-card text-foreground',
      warning: 'border-warning bg-warning/10 text-warning-foreground',
      /** Tramo 90–100 % de la cuota (mockup `resumen-espacio`): fondo `destructive-soft` al 10 %. */
      critical: 'border-destructive-soft bg-destructive-soft/10 text-destructive',
      /** Resultado de una acción (mockup `identity/seguridad`): texto `foreground` sobre `success` al 10 % (AA). */
      success: 'border-success bg-success/10 text-foreground',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps): React.JSX.Element {
  return (
    <div
      role={variant === 'error' || variant === 'critical' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant, className }))}
      {...props}
    />
  );
}
