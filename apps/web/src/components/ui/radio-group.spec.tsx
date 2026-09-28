import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../test-a11y';
import { RadioGroup } from './radio-group';

const OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'equipo', label: 'Equipo' },
] as const;

describe('RadioGroup', () => {
  it('usa radios nativos con el mismo nombre, sin un manejador de teclado propio', () => {
    const markup = renderToStaticMarkup(
      <RadioGroup name="plan" legend="Elige un plan" options={OPTIONS} error errorMessage="Elige un plan" />,
    );

    expect(markup.match(/type="radio"/g)).toHaveLength(2);
    expect(markup.match(/name="plan"/g)).toHaveLength(2);
    expect(markup).toContain('<fieldset');
    expect(markup).toContain('Elige un plan');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby=');
    expect(markup).not.toContain('onKeyDown');
    expect(markup).toContain('min-h-11');
    expect(markup).toContain('focus-visible:ring-2');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<RadioGroup name="plan" legend="Elige un plan" options={OPTIONS} />);
  });
});
