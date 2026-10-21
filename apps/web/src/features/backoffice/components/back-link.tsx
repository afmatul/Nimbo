import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

/** «Volver a cuentas» o «Volver a la ficha de…» sobre el título (mockups de `backoffice/`): 44 px de alto en móvil. */
export function BackLink({
  href,
  label,
}: {
  readonly href: string;
  readonly label: string;
}): JSX.Element {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-medium text-primary hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
