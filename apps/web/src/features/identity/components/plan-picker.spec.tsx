import { formatGtq } from '@nimbo/contracts';
import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../../../components/test-a11y';

import { catalogPlan } from './catalog-plan.fixture';
import { PlanPicker, type CatalogPlan } from './plan-picker';

const PLANS: readonly CatalogPlan[] = [
  catalogPlan({ id: 'personal', name: 'Personal', priceCents: 0 }),
  catalogPlan({ id: 'equipo', name: 'Equipo', priceCents: 45000, maxEditors: 5 }),
];

describe('PlanPicker', () => {
  it('muestra una tarjeta por plan con precio y límites del catálogo y preselecciona el gratuito', () => {
    const markup = renderToStaticMarkup(<PlanPicker plans={PLANS} />);

    expect(markup).toContain('Personal');
    expect(markup).toContain('Equipo');
    expect(markup).toContain('Q0.00');
    expect(markup).toContain('Q450.00');
    expect(markup.match(/Almacenamiento/g)).toHaveLength(2);
    expect(markup.match(/type="radio"/g)).toHaveLength(2);
    expect(markup.match(/checked/g)).toHaveLength(1);
    expect(markup).toContain('Plan elegido');
  });

  it('I-4: formatea el precio igual que /planes, con separador de miles', () => {
    const markup = renderToStaticMarkup(
      <PlanPicker plans={[catalogPlan({ id: 'e', name: 'Empresa', priceCents: 1_250_000 })]} />,
    );

    expect(markup).toContain(`Empresa · ${formatGtq(1_250_000)}`);
    expect(markup).toContain(formatGtq(1_250_000));
  });

  it('el plan indicado por `value` es el elegido', () => {
    const markup = renderToStaticMarkup(<PlanPicker plans={PLANS} value="equipo" />);

    expect(markup).toMatch(/value="equipo"[^>]*checked|checked[^>]*value="equipo"/);
  });

  it('todas las tarjetas comparten el mismo grupo de radios', () => {
    const markup = renderToStaticMarkup(<PlanPicker plans={PLANS} />);

    expect(new Set(markup.match(/name="[^"]+"/g)).size).toBe(1);
  });

  it('sin catálogo explica que la cuenta empieza en Personal', () => {
    const markup = renderToStaticMarkup(<PlanPicker plans={[]} unavailable />);

    expect(markup).toContain('No pudimos cargar los planes; tu cuenta empezará en Personal.');
    expect(markup).not.toContain('type="radio"');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<PlanPicker plans={PLANS} />);
  });
});
