/**
 * @jest-environment jsdom
 */
import type { FileSummary } from '@nimbo/contracts';
import { render, screen, waitFor } from '@testing-library/react';

import { DocxThumbnail } from './DocxThumbnail';

const authFetch = jest.fn();
jest.mock('../../../identity/session/use-auth-fetch', () => ({ useAuthFetch: () => authFetch }));

const FILE = { id: 'f1', name: 'acta.docx', kind: 'docx' } as unknown as FileSummary;

/** Una tarjeta ya cerca de la pantalla: el observador avisa en cuanto se le pide observar. */
class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(): void {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
  disconnect(): void {}
}

beforeEach(() => {
  authFetch.mockReset();
  window.IntersectionObserver = VisibleObserver as never;
});

describe('DocxThumbnail', () => {
  it('pide el extracto a la API y lo dibuja, decorativo para lectores de pantalla', async () => {
    authFetch.mockResolvedValue({ text: 'Acta de reunión' });
    const { container } = render(<DocxThumbnail file={FILE} apiPublicUrl="http://api/v1/" />);

    await waitFor(() => expect(screen.getByText('Acta de reunión')).toBeTruthy());
    expect(authFetch).toHaveBeenCalledWith('http://api/v1/files/f1/thumbnail', expect.anything());
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each([
    ['sin texto', () => authFetch.mockResolvedValue({ text: null })],
    ['con una respuesta inválida', () => authFetch.mockResolvedValue({ nombre: 'acta.docx' })],
    ['si la petición falla', () => authFetch.mockRejectedValue(new Error('red'))],
  ])('%s no dibuja nada: la tarjeta conserva su hoja de renglones', async (_case, arrange) => {
    arrange();
    const { container } = render(<DocxThumbnail file={FILE} apiPublicUrl="http://api/v1" />);

    await waitFor(() => expect(authFetch).toHaveBeenCalled());
    expect(container.querySelector('p')).toBeNull();
  });

  it('no pide nada mientras la tarjeta está lejos de la pantalla', () => {
    window.IntersectionObserver = class {
      observe(): void {}
      disconnect(): void {}
    } as never;
    render(<DocxThumbnail file={FILE} apiPublicUrl="http://api/v1" />);
    expect(authFetch).not.toHaveBeenCalled();
  });
});
