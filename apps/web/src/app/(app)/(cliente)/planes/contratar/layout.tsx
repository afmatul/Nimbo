import type { ReactNode } from 'react';

import { FocusedLayout } from '../../../../../components/nimbo/focused-layout';

/** El pago va sin barra lateral, como su mockup, pero con el logo y el menú de la cuenta; también en carga y error. */
export default function PaymentLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return <FocusedLayout>{children}</FocusedLayout>;
}
