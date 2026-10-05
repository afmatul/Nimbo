/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';

import { auditEvent, SUPPORT_RESTORE } from '../test-audit-event';

import { ActivityEventRow } from './activity-event-row';

function renderRow(event = auditEvent()): HTMLElement {
  render(
    <ol>
      <ActivityEventRow event={event} />
    </ol>,
  );
  return screen.getByRole('listitem');
}

describe('ActivityEventRow', () => {
  it('CA-7: muestra la acción, el origen, el recurso y la fecha, sin distintivo interno', () => {
    const row = renderRow();

    expect(within(row).getByText('Subiste 1 archivo')).toBeTruthy();
    expect(row.textContent).toContain('Origen: Tú');
    expect(row.textContent).toContain('1 archivo, 12 MB');
    expect(row.textContent).toContain('5 oct 2026');
    expect(row.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-05T15:15:00.000Z');
    expect(row.textContent).not.toContain('Acción interna');
    expect(row.textContent).not.toContain('Motivo');
  });

  it('CA-7: el mes de septiembre se abrevia «sept»', () => {
    const row = renderRow(auditEvent({ occurredAt: '2026-09-30T16:45:00.000Z' }));

    expect(row.textContent).toContain('30 sept 2026');
  });

  it('CA-13: una acción interna lleva el texto «Acción interna» (no solo color) y el bloque del motivo', () => {
    const row = renderRow(SUPPORT_RESTORE);

    expect(within(row).getByText('Soporte de Nimbo restauró 3 elementos')).toBeTruthy();
    expect(within(row).getByText('Acción interna')).toBeTruthy();
    expect(row.textContent).toContain('Origen: Soporte de Nimbo');
    const reason = within(row).getByRole('note', { name: 'Motivo escrito por Soporte de Nimbo' });
    expect(reason.textContent).toContain('Restauración pedida por ti en el caso 4821.');
  });

  it('CA-13: una acción interna sin motivo se distingue igual, sin bloque de motivo', () => {
    const { note: _note, ...withoutNote } = SUPPORT_RESTORE;
    const row = renderRow(withoutNote);

    expect(within(row).getByText('Acción interna')).toBeTruthy();
    expect(within(row).queryByRole('note')).toBeNull();
  });
});
