/** La entrada solo identifica el archivo; la entrega se reautoriza dentro del visor. */
export function previewPathOf(fileId: string): string {
  return `/archivos/vista-previa/${encodeURIComponent(fileId)}`;
}
