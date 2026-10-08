export function formatQuetzales(precioCentavos: number): string {
  const quetzales = precioCentavos / 100;
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(quetzales);
}

export function formatBytes(bytesStr: string): string {
  const bytes = BigInt(bytesStr);
  if (bytes === 0n) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = Number(bytes);

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }

  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatEditores(maxEditores: number): string {
  return maxEditores > 0 ? 'Sí' : 'Solo lectura';
}