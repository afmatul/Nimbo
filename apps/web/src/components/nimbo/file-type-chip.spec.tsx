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

  it('007 T-07: las imágenes con firma (png, jpg, jpeg, gif, webp) son del tipo imagen, como `imagen` de la API', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
      expect(getFileTypeFromExtension(`foto.${ext}`)).toBe('img');
    }
    expect(getFileTypeFromExtension('logo.svg')).toBe('other');
  });

  it('007 T-07: renderiza el chip de imagen con su ícono y los tokens --file-img', () => {
    const markup = renderToStaticMarkup(<FileTypeChip fileType="img" />);
    expect(markup).toContain('IMG');
    expect(markup).toContain('--file-img');
    expect(markup).toContain('--file-img-bg');
    expect(markup).toContain('lucide-image');
  });

  it('007: .txt y .md son del tipo texto, como `texto` de la API (no «otro»)', () => {
    expect(getFileTypeFromExtension('notas.txt')).toBe('text');
    expect(getFileTypeFromExtension('LEEME.MD')).toBe('text');
  });

  it('007: el chip de texto dice TEXTO y usa los tokens neutros --file-other (sin colores nuevos)', () => {
    const markup = renderToStaticMarkup(<FileTypeChip fileType="text" />);
    expect(markup).toContain('TEXTO');
    expect(markup).toContain('--file-other');
    expect(markup).toContain('--file-other-bg');
    expect(markup).not.toContain('OTRO');
  });
});
