/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';

import { useViewCache, ViewCacheProvider } from './view-cache';

function Probe({ write }: { readonly write: boolean }): React.JSX.Element {
  const cache = useViewCache();
  if (write) cache.set('k', 'guardado');
  return <p>{cache.get<string>('k') ?? 'vacío'}</p>;
}

describe('view-cache', () => {
  it('conserva lo guardado al volver a montar una vista dentro del proveedor', () => {
    const { rerender } = render(
      <ViewCacheProvider>
        <Probe write />
      </ViewCacheProvider>,
    );
    rerender(
      <ViewCacheProvider>
        <Probe write={false} />
      </ViewCacheProvider>,
    );

    expect(screen.getByText('guardado')).toBeTruthy();
  });

  it('no guarda nada fuera del proveedor', () => {
    const { unmount } = render(<Probe write />);
    unmount();
    render(<Probe write={false} />);

    expect(screen.getByText('vacío')).toBeTruthy();
  });
});
