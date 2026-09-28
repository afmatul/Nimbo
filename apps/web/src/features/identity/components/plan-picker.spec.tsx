import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../../../components/test-a11y';
import { PlanPicker, type CatalogPlan } from './plan-picker';

const PLANS: readonly CatalogPlan[] = [
  { id: 'personal', name: 'Personal', priceCents: 0, free: true },
  { id: 'equipo', name: 'Equipo', priceCents: 45000, free: false },
];

describe('PlanPicker', () => {
  it('muestra nombres y precios del catálogo y preselecciona el gratuito', () => {
    const markup = renderToStaticMarkup(<PlanPicker plans={PLANS} />);

    expect(markup).toContain('Personal');
    expect(markup).toContain('Equipo');
    expect(markup).toContain('Q0.00');
    expect(markup).toContain('Q450.00');
    expect(markup).toContain('checked');
  });

  it('sin catálogo explica que la cuenta empieza en Personal', () => {
    const markup = renderToStaticMarkup(<PlanPicker plans={[]} unavailable />);

    expect(markup).toContain('No pudimos cargar los planes; tu cuenta empezará en Personal.');
    expect(markup).not.toContain('type="radio"');
  });

  it('los radios comparten name para que el teclado los recorra', () => {
    const markup = renderToStaticMarkup(<PlanPicker plans={PLANS} />);
    const names = markup.match(/name="plan"/g) ?? [];

    expect(names).toHaveLength(2);
    expect(markup).toContain('type="radio"');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<PlanPicker plans={PLANS} />);
  });
});
