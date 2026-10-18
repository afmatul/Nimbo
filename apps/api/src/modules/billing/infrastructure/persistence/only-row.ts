/**
 * La única fila de una consulta que siempre devuelve una (`nextval`, `INSERT … RETURNING`); si no llega, falla el cobro
 * entero (spec 009). La comparten los repositorios de pago y de factura (revisión del PR #62, #7).
 */
export const onlyRow = <T>(rows: readonly T[]): T => {
  const [row] = rows;
  if (row === undefined) throw new Error('La base no devolvió la fila esperada.');
  return row;
};
