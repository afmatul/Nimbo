import { formatGtq } from '@nimbo/contracts';
import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../../../components/test-a11y';
import { RadioGroup, type RadioGroupProps } from '../../../components/ui/radio-group';
import type * as RadioGroupModule from '../../../components/ui/radio-group';

import { PlanPicker, type CatalogPlan } from './plan-picker';

jest.mock('../../../components/ui/radio-group', () => {
  const actual: typeof RadioGroupModule = jest.requireActual('../../../components/ui/radio-group');
  return { ...actual, RadioGroup: jest.fn(actual.RadioGroup) };
});

const PLANS: readonly CatalogPlan[] = [
  { id: 'personal', slug: 'personal', name: 'Personal', priceCents: 0, free: true },
  { id: 'equipo', slug: 'equipo', name: 'Equipo', priceCents: 45000, free: false },
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

  it('I-4: formatea el precio igual que el catálogo de /planes, con separador de miles', () => {
    const markup = renderToStaticMarkup(
      <PlanPicker
        plans={[
          { id: 'empresa', slug: 'empresa', name: 'Empresa', priceCents: 1_250_000, free: false },
        ]}
      />,
    );

    expect(markup).toContain(`Empresa · ${formatGtq(1_250_000)}`);
    expect(markup).toContain('Q12 500.00');
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

  it('PR-4 I-1: reutiliza el `RadioGroup` de `components/ui` en su variante controlada', () => {
    const onChange = jest.fn();
    renderToStaticMarkup(<PlanPicker plans={PLANS} value="equipo" onChange={onChange} />);

    const [props] = jest.mocked(RadioGroup).mock.calls[0] as [RadioGroupProps];
    expect(props).toMatchObject({
      name: 'plan',
      value: 'equipo',
      options: [
        { value: 'personal', label: 'Personal · Q0.00' },
        { value: 'equipo', label: 'Equipo · Q450.00' },
      ],
    });
    props.onValueChange?.('personal');
    expect(onChange).toHaveBeenCalledWith('personal');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<PlanPicker plans={PLANS} />);
  });
});
