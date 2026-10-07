/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import VistaPreviaPage from './page';

const FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';

async function renderPreview(): Promise<HTMLElement> {
  const page = await VistaPreviaPage({ params: Promise.resolve({ fileId: FILE_ID }) });
  const { container } = render(page);
  await act(async () => undefined);
  return container;
}

describe('ruta de vista previa (/archivos/vista-previa/[fileId]), marcador hasta T-06', () => {
  it('017 CA-7: solo ofrece «Volver», que regresa a Mis archivos con la fila como objetivo de foco', async () => {
    await renderPreview();

    expect(screen.getByRole('heading', { level: 1, name: 'Vista previa' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver' }).getAttribute('href')).toBe(
      `/archivos?foco=${FILE_ID}`,
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('017 CA-9: no tiene violaciones de accesibilidad', async () => {
    const container = await renderPreview();

    expect((await axe(container)).violations).toEqual([]);
  });
});
