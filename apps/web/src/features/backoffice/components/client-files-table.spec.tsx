/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';

import { clientFile, LAURA, TRASHED_PDF } from '../test-client-files';

import { ClientFilesTable } from './client-files-table';

const CAPTION =
  'Archivos de Laura Barrios: metadatos, ordenados por última modificación, de la más reciente';

function renderTable(): HTMLElement {
  render(<ClientFilesTable clientName={LAURA.fullName} items={[clientFile(), TRASHED_PDF]} />);
  return screen.getByRole('table', { name: CAPTION });
}

function cellsOf(row: number): string[] {
  const rows = within(renderTable()).getAllByRole('row').slice(1);
  return within(rows[row] as HTMLElement)
    .getAllByRole('cell')
    .map((cell) => cell.textContent ?? '');
}

describe('ClientFilesTable (011 CA-13)', () => {
  it('CA-13: columnas Nombre, Tipo, Tamaño, Creado, Modificado y Estado', () => {
    const table = renderTable();

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Nombre', 'Tipo', 'Tamaño', 'Creado', 'Modificado', 'Estado']);
  });

  it('CA-13: nombre, tipo, tamaño formateado, fechas con hora y «Disponible»', () => {
    const [name, kind, size, created, updated, status] = cellsOf(0);

    expect(name).toContain('Propuesta_Nimbo_v3.docx');
    expect(kind).toBe('Documento de Word (.docx)');
    expect(size).toBe('2,4 MB');
    expect(created).toMatch(/^14\/09\/2026,? \d{2}:\d{2}/);
    expect(updated).toMatch(/^03\/10\/2026,? \d{2}:\d{2}/);
    expect(status).toBe('Disponible');
  });

  it('CA-13: un archivo en la papelera dice «En papelera desde…» con la fecha (006)', () => {
    const status = cellsOf(1)[5];

    expect(status).toBe('En papelera desde 01/10/2026');
  });

  it('CA-13, RN-1: ninguna fila ni nombre es un enlace o un botón', () => {
    const table = renderTable();

    expect(within(table).queryAllByRole('link')).toEqual([]);
    expect(within(table).queryAllByRole('button')).toEqual([]);
  });
});
