import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, JSX, ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { Card } from '../ui/card';

import { SignupSteps, type SignupStep } from './signup-steps';

export type IdentityCardTone = 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASSES: Readonly<Record<IdentityCardTone, string>> = {
  info: 'rounded-lg bg-accent text-primary',
  success: 'rounded-full bg-success/15 text-success-foreground',
  warning: 'rounded-lg bg-warning/15 text-warning-foreground',
  danger: 'rounded-lg bg-destructive/10 text-destructive',
};

export interface IdentityCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  readonly titleId: string;
  readonly title: string;
  readonly icon: LucideIcon;
  readonly tone: IdentityCardTone;
  /** Clases extra del ícono; por ejemplo, el giro del estado «verificando». */
  readonly iconClassName?: string;
  /** Paso del registro; sin él no se muestra el indicador (p. ej., «ya verificado»). */
  readonly step?: SignupStep;
  /** Texto bajo el título, centrado con él. */
  readonly description?: ReactNode;
  readonly children?: ReactNode;
}

/**
 * Tarjeta centrada de las pantallas de cuenta sin sesión (Revisa tu correo, pedir enlace, verificación):
 * pasos del registro, ícono contextual, título y contenido.
 */
export function IdentityCard({
  titleId,
  title,
  icon: Icon,
  tone,
  iconClassName,
  step,
  description,
  children,
  className,
  ...props
}: IdentityCardProps): JSX.Element {
  return (
    <section
      aria-labelledby={titleId}
      className={cn('mx-auto w-full max-w-md space-y-6 px-4 py-10 sm:py-16', className)}
      {...props}
    >
      {step === undefined ? null : <SignupSteps current={step} />}
      <Card className="space-y-6 p-6 sm:p-8">
        <div className="space-y-3 text-center">
          <span
            className={cn('mx-auto flex h-12 w-12 items-center justify-center', TONE_CLASSES[tone])}
          >
            <Icon aria-hidden="true" className={cn('h-6 w-6', iconClassName)} />
          </span>
          <h1 id={titleId} className="text-2xl font-semibold text-foreground">
            {title}
          </h1>
          {description}
        </div>
        {children}
      </Card>
    </section>
  );
}
