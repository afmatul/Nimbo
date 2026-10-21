/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Ban, CircleCheck } from 'lucide-react';

import { StatusBadge } from './status-badge';

describe('StatusBadge (ui-guidelines §4)', () => {
  it('muestra el estado con ícono y texto, nunca solo color (Art. XIII.4)', () => {
    const { container } = render(<StatusBadge tone="success" icon={CircleCheck} label="Activa" />);

    expect(screen.getByText('Activa')).toBeTruthy();
    const icon = container.querySelector('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each([
    ['success', 'text-success-foreground'],
    ['destructive', 'text-destructive'],
    ['neutral', 'text-secondary-foreground'],
  ] as const)('el tono %s usa solo tokens (%s)', (tone, textClass) => {
    render(<StatusBadge tone={tone} icon={Ban} label="Estado" />);

    expect(screen.getByText('Estado').className).toContain(textClass);
  });

  it('sin violaciones de axe', async () => {
    const { container } = render(
      <p>
        <StatusBadge tone="success" icon={CircleCheck} label="Activa" />
        <StatusBadge tone="destructive" icon={Ban} label="Suspendida" />
      </p>,
    );

    expect((await axe(container)).violations).toEqual([]);
  });
});
