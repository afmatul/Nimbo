/** Enteros con espacio de no separación como separador de miles: 2 000, 10 000 (como el mockup). */
export function formatCount(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

/** Centavos enteros a quetzales con dos decimales: Q0.00, Q45.00, Q110.00 (RN-1, solo presentación). */
export function formatQuetzales(precioCentavos: number): string {
  const quetzales = Math.trunc(precioCentavos / 100);
  const centavos = String(precioCentavos % 100).padStart(2, '0');
  return `Q${formatCount(quetzales)}.${centavos}`;
}

export function formatBytes(bytesStr: string | bigint): string {
  const bytes = typeof bytesStr === 'bigint' ? bytesStr : BigInt(bytesStr);
  if (bytes === 0n) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = Number(bytes);

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }

  // parseFloat quita el ".0" sobrante: 15 GB, no 15.0 GB
  const formattedSize = parseFloat(size.toFixed(1)).toString();

  return `${formattedSize} ${units[i]}`;
}

// Edición .docx: «Solo lectura» cuando maxEditores es 0, «Sí» en cualquier otro caso (CA-2)
export function formatEditores(maxEditores: number): string {
  return maxEditores > 0 ? 'Sí' : 'Solo lectura';
}
