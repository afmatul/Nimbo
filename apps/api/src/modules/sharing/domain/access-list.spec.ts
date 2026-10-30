import { AccessList } from './access-list';
import type { DirectAccess, InheritedAccess } from './access-list';

const GRANTED = new Date('2026-10-30T10:00:00.000Z');

const direct: DirectAccess = {
  shareId: '0b6f1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  grantee: { id: '3e9c4051-6d7e-4f80-b192-0c1d2e3f4051', displayName: 'Bea', email: 'bea@ej.com' },
  level: 'EDITOR',
  createdAt: GRANTED,
};

const inherited: InheritedAccess = {
  grantee: {
    id: '4fad5162-7e8f-4091-82a3-1d2e3f405162',
    displayName: 'Ciro',
    email: 'ciro@ej.com',
  },
  level: 'VIEWER',
  createdAt: GRANTED,
  folder: { id: '1c7a2e3f-4b5c-4d6e-9f70-8a9b0c1d2e3f', name: 'Proyecto' },
};

describe('AccessList (plan 012 §2)', () => {
  it('CA-8: agrupa los accesos directos y los heredados', () => {
    const list = AccessList.of({ direct: [direct], inherited: [inherited] });

    expect(list.direct).toEqual([direct]);
    expect(list.inherited).toEqual([inherited]);
  });

  it('CA-8: las entradas llevan su origen, primero las directas y luego las heredadas', () => {
    const list = AccessList.of({ direct: [direct], inherited: [inherited] });

    expect(list.entries()).toEqual([
      { ...direct, origin: 'direct' },
      { ...inherited, origin: 'inherited' },
    ]);
  });

  it('CA-8: un nodo sin accesos da una lista vacía', () => {
    expect(AccessList.of({ direct: [], inherited: [] }).entries()).toEqual([]);
  });

  it('es inmutable: cambiar los arreglos de origen no la altera', () => {
    const source = [direct];
    const list = AccessList.of({ direct: source, inherited: [] });

    source.pop();

    expect(list.direct).toEqual([direct]);
    expect(Object.isFrozen(list.direct)).toBe(true);
  });
});
