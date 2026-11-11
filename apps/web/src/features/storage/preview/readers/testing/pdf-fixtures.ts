/** PDF sintético con xref real y offsets ASCII deterministas; no contiene datos de clientes. */
export function pdfFixture(
  options: {
    readonly pages?: number;
    readonly scanned?: boolean;
    readonly script?: boolean;
    readonly protected?: boolean;
    readonly padding?: number;
  } = {},
): Uint8Array {
  const count = options.pages ?? 1;
  const kids = Array.from({ length: count }, (_, i) => `${4 + i * 2} 0 R`).join(' ');
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${options.script ? '/OpenAction << /S /JavaScript /JS (globalThis.PDF_SCRIPT_EXECUTED=true) >>' : ''} >>`,
    `<< /Type /Pages /Count ${count} /Kids [${kids}] >>`,
    options.scanned
      ? '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\nRGB\nendstream'
      : '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (let i = 0; i < count; i++) {
    const content = options.scanned
      ? 'q 100 0 0 100 0 0 cm /Scan Do Q'
      : `0 0 1 rg 10 10 40 40 re f BT /F1 12 Tf 20 150 Td (Pagina ${i + 1}) Tj ET`;
    const stream = `${content}\n%${' '.repeat(options.padding ?? 0)}\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << ${options.scanned ? '/XObject << /Scan 3 0 R >>' : '/Font << /F1 3 0 R >>'} >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    );
  }
  if (options.protected)
    objects.push(
      `<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${'00'.repeat(32)}> /U <${'11'.repeat(32)}> /P -4 >>`,
    );
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${options.protected ? `/Encrypt ${objects.length} 0 R /ID [<00112233445566778899aabbccddeeff><00112233445566778899aabbccddeeff>]` : ''} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
