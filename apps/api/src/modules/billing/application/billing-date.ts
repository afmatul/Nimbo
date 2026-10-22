const BILLING_DATE_FORMAT = new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Fecha larga de Guatemala («4 de noviembre de 2026») de la factura (009) y de los correos de la renovación (010). */
export const formatBillingDate = (at: Date): string => BILLING_DATE_FORMAT.format(at);
