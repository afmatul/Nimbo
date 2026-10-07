import { NODE_SORTS, NodeOrder, SORT_DIRECTIONS } from './node-order';

describe('NodeOrder', () => {
  describe('of (valores por defecto, D-6)', () => {
    it('CA-10: sin orden pedido es fecha de creación descendente, el de 006', () => {
      const order = NodeOrder.of();

      expect([order.sort, order.dir]).toEqual(['created', 'desc']);
    });

    it('CA-10: `created` sin dirección es descendente', () => {
      expect(NodeOrder.of('created').dir).toBe('desc');
    });

    it.each(['name', 'size', 'updated'] as const)(
      'CA-10: `%s` sin dirección es ascendente',
      (sort) => {
        expect(NodeOrder.of(sort).dir).toBe('asc');
      },
    );

    it('CA-10: respeta la dirección pedida', () => {
      const order = NodeOrder.of('name', 'desc');

      expect([order.sort, order.dir]).toEqual(['name', 'desc']);
    });

    it('es inmutable', () => {
      expect(Object.isFrozen(NodeOrder.of())).toBe(true);
    });
  });

  describe('keyFor (D-7)', () => {
    const everyOrder = NODE_SORTS.flatMap((sort) =>
      SORT_DIRECTIONS.map((dir) => NodeOrder.of(sort, dir)),
    );

    it.each(everyOrder)('CA-10: los archivos usan el orden pedido ($sort $dir)', (order) => {
      expect(order.keyFor('file')).toEqual({ sort: order.sort, dir: order.dir });
    });

    it.each(everyOrder.filter((order) => order.sort !== 'size'))(
      'CA-10: las carpetas usan su propia columna con `$sort` $dir',
      (order) => {
        expect(order.keyFor('folder')).toEqual({ sort: order.sort, dir: order.dir });
      },
    );

    it.each(SORT_DIRECTIONS)(
      'CA-10: con `size` %s las carpetas (sin tamaño) van por nombre ascendente',
      (dir) => {
        expect(NodeOrder.of('size', dir).keyFor('folder')).toEqual({ sort: 'name', dir: 'asc' });
      },
    );
  });
});
