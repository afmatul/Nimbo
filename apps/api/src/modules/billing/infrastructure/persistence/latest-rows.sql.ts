/**
 * El último pago aprobado y la última factura del dueño (`$1`), con las columnas pedidas (009 CA-7; 010 RN-2, RN-4).
 * Una sola forma para el historial, la vista y la renovación automática (DRY).
 */
export const lastApprovedPaymentSql = (columns: string): string =>
  `SELECT ${columns} FROM transaccion WHERE usuario_id = $1 AND estado = 'aprobada'
    ORDER BY creado_en DESC, id DESC LIMIT 1`;

export const latestInvoiceSql = (columns: string): string =>
  `SELECT ${columns} FROM factura WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC LIMIT 1`;
