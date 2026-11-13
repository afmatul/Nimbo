/**
 * @jest-environment jsdom
 */
import type { FileKind } from '@nimbo/contracts';
import { render, screen, waitFor } from '@testing-library/react';

import { fakeIndexingApi, indexingStatus } from '../test-indexing';

import { IndexingCardBadge } from './indexing-card-badge';

jest.mock('../../realtime/use-realtime', () => ({
  useRealtime: () => ({ on: () => () => undefined, connectionId: null }),
}));

const file = (kind: FileKind) => ({ id: 'f1', kind });

/** Una tarjeta ya cerca de la pantalla: el observador avisa en cuanto se le pide observar. */
class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(): void {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
  disconnect(): void {}
}

beforeEach(() => {
  window.IntersectionObserver = VisibleObserver as never;
});

describe('IndexingCardBadge', () => {
  it('muestra el estado de un archivo indexable cuando la tarjeta está cerca de la pantalla', async () => {
    const api = fakeIndexingApi({ status: jest.fn().mockResolvedValue(indexingStatus()) });
    render(<IndexingCardBadge api={api} file={file('pdf')} />);

    await waitFor(() => expect(screen.getByText('Indexado')).toBeTruthy());
    expect(api.status).toHaveBeenCalledWith('f1');
  });

  it.each(['imagen', 'otro'] as const)('no consulta nada para un archivo de tipo «%s»', (kind) => {
    const api = fakeIndexingApi();
    render(<IndexingCardBadge api={api} file={file(kind)} />);
    expect(api.status).not.toHaveBeenCalled();
  });

  it('no consulta mientras la tarjeta está lejos de la pantalla', () => {
    window.IntersectionObserver = class {
      observe(): void {}
      disconnect(): void {}
    } as never;
    const api = fakeIndexingApi();
    render(<IndexingCardBadge api={api} file={file('docx')} />);
    expect(api.status).not.toHaveBeenCalled();
  });
});
