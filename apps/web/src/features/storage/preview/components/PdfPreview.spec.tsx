/** @jest-environment jsdom */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { openPdfSession, PdfReadError } from '../readers/pdfjs-adapter';
import { createPdfRuntime } from '../readers/pdfjs-runtime';

import { PdfPreview } from './PdfPreview';

jest.mock('../readers/pdfjs-adapter', () => ({
  ...jest.requireActual('../readers/pdfjs-adapter'),
  openPdfSession: jest.fn(),
}));
jest.mock('../readers/pdfjs-runtime', () => ({ createPdfRuntime: jest.fn() }));
const SIGNED = 'https://objects.test/private?signature=PRIVATE';
const dispose = jest.fn<Promise<void>, []>();
const renderPage = jest.fn<Promise<void>, []>();

describe('PdfPreview T-08: representación, navegación y lifecycle', () => {
  beforeEach(() => {
    dispose.mockReset().mockResolvedValue(undefined);
    renderPage.mockReset().mockResolvedValue(undefined);
    jest
      .mocked(createPdfRuntime)
      .mockResolvedValue({ dispose: jest.fn() } as unknown as Awaited<
        ReturnType<typeof createPdfRuntime>
      >);
    jest.mocked(openPdfSession).mockResolvedValue({ numPages: 1, renderPage, dispose });
  });

  it('CA-1/9: canvas local y ready solo después de render; no signed URL en DOM', async () => {
    let finish = (): void => undefined;
    renderPage.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onReady = jest.fn();
    const onFailure = jest.fn();
    const { container } = render(
      <PdfPreview url={SIGNED} onReady={onReady} onFailure={onFailure} />,
    );
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(onReady).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: 'Página 1 del PDF' })).toBeTruthy();
    expect(/PRIVATE|signature=/.test(container.innerHTML)).toBe(false);
    expect(container.querySelector('iframe,object,embed,a')).toBeNull();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('CA-9: texto literal solo para tecnologías asistivas; capa de selección sin duplicar lectura', async () => {
    render(<PdfPreview url={SIGNED} onFailure={jest.fn()} />);
    await screen.findByRole('img', { name: 'Página 1 del PDF' });
    const literal = screen.getByRole('group', { name: 'Texto de la página' });
    expect(literal.classList.contains('sr-only')).toBe(true);
    expect(literal.hidden).toBe(false);
    expect(literal.getAttribute('aria-hidden')).toBeNull();
    const page = screen.getByRole('group', { name: 'Página 1' });
    const overlays = page.querySelectorAll('canvas + div');
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('CA-7: registra cleanup esperable, aborta y libera también al desmontar', async () => {
    let cleanup: (() => Promise<void>) | undefined;
    const onFailure = jest.fn();
    const { unmount } = render(
      <PdfPreview
        url={SIGNED}
        onFailure={onFailure}
        registerCleanup={(value) => {
          cleanup = value;
          return () => undefined;
        }}
      />,
    );
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    await act(async () => {
      await cleanup?.();
      await cleanup?.();
    });
    expect(jest.mocked(openPdfSession).mock.calls[0]?.[0].signal.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('CA-1/9: todas las páginas son alcanzables con teclado, un solo canvas y foco estable', async () => {
    jest.mocked(openPdfSession).mockResolvedValueOnce({ numPages: 3, renderPage, dispose });
    const { container } = render(
      <main>
        <PdfPreview url={SIGNED} onFailure={jest.fn()} />
      </main>,
    );
    await screen.findByRole('img', { name: 'Página 1 del PDF' });
    expect(screen.getByText('Página 1 de 3')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    const next = screen.getByRole('button', { name: 'Siguiente' });
    next.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('img', { name: 'Página 2 del PDF' });
    expect(document.activeElement).toBe(next);
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('img', { name: 'Página 3 del PDF' });
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    await screen.findByRole('img', { name: 'Página 2 del PDF' });
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('CA-9: al llegar a un extremo el foco pasa al control opuesto, nunca a uno deshabilitado', async () => {
    jest.mocked(openPdfSession).mockResolvedValueOnce({ numPages: 2, renderPage, dispose });
    render(<PdfPreview url={SIGNED} onFailure={jest.fn()} />);
    await screen.findByRole('img', { name: 'Página 1 del PDF' });
    const previous = screen.getByRole('button', { name: 'Anterior' });
    const next = screen.getByRole('button', { name: 'Siguiente' });
    next.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('img', { name: 'Página 2 del PDF' });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(previous);
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('img', { name: 'Página 1 del PDF' });
    expect((previous as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(next);
  });

  it('CA-9: PDF de una página deshabilita ambos controles sin mover el foco a ninguno', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    render(<PdfPreview url={SIGNED} onFailure={jest.fn()} />);
    await screen.findByRole('img', { name: 'Página 1 del PDF' });
    expect(screen.getByText('Página 1 de 1')).toBeTruthy();
    for (const name of ['Anterior', 'Siguiente'])
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it.each(['protected', 'corrupt', 'unavailable', 'memory'] as const)(
    'CA-2: apertura %s conserva razón sin detalles ni password UI',
    async (reason) => {
      jest.mocked(openPdfSession).mockRejectedValueOnce(new PdfReadError(reason));
      const onFailure = jest.fn();
      const { container } = render(<PdfPreview url={SIGNED} onFailure={onFailure} />);
      await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
      expect(onFailure).toHaveBeenCalledWith({ reason, correlationId: '' });
      expect(container.querySelector('canvas,input,dialog,iframe,object,embed')).toBeNull();
      expect(/PRIVATE|signature=/.test(container.innerHTML)).toBe(false);
    },
  );

  it('CA-2: RangeError genérico no se etiqueta como falta de memoria', async () => {
    jest.mocked(openPdfSession).mockRejectedValueOnce(new RangeError('PRIVATE'));
    const onFailure = jest.fn();
    render(<PdfPreview url={SIGNED} onFailure={onFailure} />);
    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    expect(onFailure).toHaveBeenCalledWith({ reason: 'unavailable', correlationId: '' });
  });
});
