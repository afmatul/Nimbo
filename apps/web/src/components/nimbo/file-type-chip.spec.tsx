import { renderToStaticMarkup } from 'react-dom/server';

import { FileTypeChip, getFileTypeFromExtension } from './file-type-chip';

describe('FileTypeChip component (CA-4, DF-44)', () => {
  it('detecta correctamente el tipo de archivo desde la extensión', () => {
    expect(getFileTypeFromExtension('reporte.docx')).toBe('docx');
    expect(getFileTypeFromExtension('datos.xlsx')).toBe('xlsx');
    expect(getFileTypeFromExtension('presentacion.pptx')).toBe('pptx');
    expect(getFileTypeFromExtension('documento.pdf')).toBe('pdf');
    expect(getFileTypeFromExtension('foto.png')).toBe('img');
    expect(getFileTypeFromExtension('foto.jpg')).toBe('img');
    expect(getFileTypeFromExtension('archivo.zip')).toBe('other');
  });

  it('renderiza chip .docx con texto legible y fondo al 12% (DF-44)', () => {
    const markup = renderToStaticMarkup(<FileTypeChip extension="docx" />);
    expect(markup).toContain('DOCX');
    expect(markup).toContain('--file-docx');
    expect(markup).toContain('--file-docx-bg');
  });

  it('renderiza chip .pdf con sus estilos propios', () => {
    const markup = renderToStaticMarkup(<FileTypeChip filename="manual.pdf" />);
    expect(markup).toContain('PDF');
    expect(markup).toContain('--file-pdf');
    expect(markup).toContain('--file-pdf-bg');
  });
});
