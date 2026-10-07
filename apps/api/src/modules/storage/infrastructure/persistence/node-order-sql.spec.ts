import { NodeOrder } from '../../domain/node-order';

import { afterCondition, orderByOf } from './node-order-sql';

const POSITION = { group: 'file' as const, value: 'v', id: 'i' };

describe('orden del listado en SQL', () => {
  it('CA-10: sin orden pedido reproduce el de 006 (`creado_en DESC, id DESC`)', () => {
    const key = NodeOrder.of().keyFor('file');

    expect(orderByOf('archivo', key)).toEqual([
      ['archivo.creadoEn', 'DESC'],
      ['archivo.id', 'DESC'],
    ]);
    expect(afterCondition('archivo', key, POSITION)).toEqual({
      sql: '(archivo.creadoEn, archivo.id) < (:afterValue, :afterId)',
      parameters: { afterValue: 'v', afterId: 'i' },
    });
  });

  it('CA-10: el nombre se compara sin mayúsculas, como los índices únicos de hermanos', () => {
    const key = NodeOrder.of('name').keyFor('folder');

    expect(orderByOf('carpeta', key)).toEqual([
      ['lower(carpeta.nombre)', 'ASC'],
      ['carpeta.id', 'ASC'],
    ]);
    expect(afterCondition('carpeta', key, POSITION).sql).toBe(
      '(lower(carpeta.nombre), carpeta.id) > (lower(CAST(:afterValue AS text)), :afterId)',
    );
  });

  it.each([
    ['size', 'archivo.tamanoBytes'],
    ['updated', 'archivo.actualizadoEn'],
  ] as const)('CA-10: `%s` descendente ordena por `%s`', (sort, column) => {
    const key = NodeOrder.of(sort, 'desc').keyFor('file');

    expect(orderByOf('archivo', key)[0]).toEqual([column, 'DESC']);
    expect(afterCondition('archivo', key, POSITION).sql).toContain(') < (');
  });

  it('CA-10: las carpetas con `size` van por nombre ascendente aunque se pida descendente', () => {
    const key = NodeOrder.of('size', 'desc').keyFor('folder');

    expect(orderByOf('carpeta', key)[0]).toEqual(['lower(carpeta.nombre)', 'ASC']);
  });
});
