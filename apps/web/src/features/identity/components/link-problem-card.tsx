import { AlertCircle, Clock } from 'lucide-react';
import type { JSX } from 'react';

import { IdentityCard } from '../../../components/nimbo/identity-card';
import type { SignupStep } from '../../../components/nimbo/signup-steps';
import { buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';

export type LinkProblem = 'enlace-expirado' | 'enlace-invalido';

/**
 * Enlace de correo vencido o no válido (mockups `verificar-correo--enlace-expirado` y `--enlace-invalido`): el mensaje
 * del catálogo y «Pedir un enlace nuevo». La usan la verificación del correo y la recuperación de contraseña.
 */
export function LinkProblemCard({
  problem,
  titleId,
  message,
  requestHref,
  step,
}: {
  readonly problem: LinkProblem;
  readonly titleId: string;
  readonly message: string;
  readonly requestHref: string;
  readonly step?: SignupStep;
}): JSX.Element {
  const expired = problem === 'enlace-expirado';
  return (
    <IdentityCard
      data-state={problem}
      titleId={titleId}
      title={expired ? 'Enlace vencido' : 'Enlace no válido'}
      icon={expired ? Clock : AlertCircle}
      tone={expired ? 'warning' : 'danger'}
      {...(step === undefined ? {} : { step })}
      description={
        <p role="alert" className="text-sm text-secondary-foreground">
          {message}
        </p>
      }
    >
      <a href={requestHref} className={cn(buttonVariants(), 'w-full')}>
        Pedir un enlace nuevo
      </a>
    </IdentityCard>
  );
}
