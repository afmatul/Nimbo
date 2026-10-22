import { Lock } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { Alert } from '../ui/alert';
import { buttonVariants } from '../ui/button';

export interface ReadOnlyBannerProps {
  readonly title: string;
  readonly description: string;
  /** Pago de la renovación (`/suscripcion/renovar`). */
  readonly renewHref: string;
}

/**
 * `ReadOnlyBanner` (`ui-guidelines.md` §4; mockup `shared/layout/layout--solo-lectura`; spec 010 CA-14, RF-23): `Alert`
 * `warning` con candado, el texto de la vista y «Renovar plan». Arriba del contenido de cada vista de escritura.
 */
export function ReadOnlyBanner({
  title,
  description,
  renewHref,
}: ReadOnlyBannerProps): React.JSX.Element {
  return (
    <Alert variant="warning" className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Lock aria-hidden="true" className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-foreground">{description}</p>
      </div>
      <Link href={renewHref} className={buttonVariants({ className: 'w-full sm:w-auto' })}>
        Renovar plan
      </Link>
    </Alert>
  );
}
