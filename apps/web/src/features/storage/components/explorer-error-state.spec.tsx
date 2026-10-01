/**
 * @jest-environment jsdom
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { ExplorerErrorState } from './explorer-error-state';

let root: Root;

async function mount(ui: ReactElement): Promise<void> {
  (globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

describe('ExplorerErrorState (CA-21)', () => {
  it('CA-21: anuncia el error del listado con los textos de la spec', async () => {
    await mount(<ExplorerErrorState title="No pudimos cargar tus archivos." onRetry={jest.fn()} />);

    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('No pudimos cargar tus archivos.');
    expect(alert?.textContent).toContain('Tus archivos siguen guardados. Inténtalo de nuevo.');
  });

  it('CA-21: «Reintentar» es outline y llama onRetry', async () => {
    const onRetry = jest.fn();
    await mount(<ExplorerErrorState title="No pudimos cargar tus archivos." onRetry={onRetry} />);
    const retry = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Reintentar',
    );

    await act(async () => retry?.click());

    expect(retry?.className).not.toContain('bg-destructive');
    expect(retry?.className).toContain('border');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('CA-21: no muestra código de soporte ni correlationId', async () => {
    await mount(<ExplorerErrorState title="No pudimos cargar tus archivos." onRetry={jest.fn()} />);

    expect(document.body.textContent).not.toMatch(/correlation|código|soporte/i);
  });
});
