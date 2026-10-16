import { BILLING_ERROR_CODES, type Plan } from '@nimbo/contracts';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { StateView } from '../../../../../components/nimbo/state-view';
import { TextLink } from '../../../../../components/nimbo/text-link';
import { getEnv } from '../../../../../env';
import { fetchPlanCatalog } from '../../../../../features/billing';
import { SessionPaymentForm } from '../../../../../features/billing/components/payment-form';
import { messageForCode } from '../../../../../lib/error-catalog';

const PLANS_HREF = '/planes';

interface ContratarPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** Plan de pago del catálogo de la 008 por su `slug`; Personal, uno inexistente o uno ya no ofrecido no se contratan. */
function paidPlanOf(plans: readonly Plan[], slug: unknown): Plan | undefined {
  return plans.find((plan) => plan.slug === slug && plan.priceCents > 0);
}

/**
 * Pago simulado (spec 009 CA-3 a CA-5, CA-9; mockup `billing/pago/`). Lee el plan en el servidor con el catálogo
 * público (008); la carga y el error los dan `loading.tsx` y `error.tsx`. El pago lo envía el cliente con su sesión.
 */
export default async function ContratarPage({
  searchParams,
}: ContratarPageProps): Promise<ReactNode> {
  const { slug } = await searchParams;
  const { plans } = await fetchPlanCatalog(getEnv().API_INTERNAL_URL);
  const plan = paidPlanOf(plans, slug);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      <TextLink href={PLANS_HREF} className="inline-flex items-center gap-1 text-sm">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Volver a planes
      </TextLink>
      {plan === undefined ? (
        <>
          <h1 className="sr-only">Contratar un plan</h1>
          <StateView
            type="empty"
            headingLevel="h2"
            icon={CircleAlert}
            title={messageForCode(BILLING_ERROR_CODES.BILLING_PLAN_NOT_AVAILABLE)}
          />
        </>
      ) : (
        <SessionPaymentForm plan={plan} apiPublicUrl={getEnv().API_PUBLIC_URL} />
      )}
    </section>
  );
}
