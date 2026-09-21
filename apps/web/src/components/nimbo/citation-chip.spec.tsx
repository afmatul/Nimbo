import { renderToStaticMarkup } from 'react-dom/server';

import { CitationChip } from './citation-chip';

describe('CitationChip component (CA-4)', () => {
  it('renderiza chip de cita con estilo oscuro para el panel del agente', () => {
    const markup = renderToStaticMarkup(
      <CitationChip filename="contrato.docx" location="pág. 4" />,
    );

    expect(markup).toContain('contrato.docx');
    expect(markup).toContain('pág. 4');
    expect(markup).toContain('bg-agent-tag');
    expect(markup).toContain('text-agent-text');
  });

  it('indica visualmente cuando la ubicación no es certera', () => {
    const markup = renderToStaticMarkup(<CitationChip filename="manual.pdf" isCertain={false} />);

    expect(markup).toContain('manual.pdf');
    expect(markup).toContain('ubicación estimada');
  });

  it('incluye atributos de accesibilidad y foco visible para teclado', () => {
    const markup = renderToStaticMarkup(<CitationChip filename="tesis.docx" location="pág. 12" />);

    expect(markup).toContain('focus-visible:ring-agent-accent');
  });
});
