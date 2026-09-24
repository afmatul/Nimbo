/**
 * @jest-environment node
 */
import { run as runAxe } from 'axe-core';
import { JSDOM } from 'jsdom';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AppLayout } from './nimbo/app-layout';
import { CitationChip } from './nimbo/citation-chip';
import { FileTypeChip } from './nimbo/file-type-chip';
import { StateView } from './nimbo/state-view';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Input } from './ui/input';

async function checkA11y(jsx: ReactElement): Promise<void> {
  const html = `<!DOCTYPE html><html lang="es"><head><title>A11y Test</title></head><body><main>${renderToStaticMarkup(jsx)}</main></body></html>`;
  const dom = new JSDOM(html, { pretendToBeVisual: true });

  const globalAny = global as unknown as Record<string, unknown>;
  globalAny['window'] = dom.window;
  globalAny['document'] = dom.window.document;
  globalAny['Node'] = dom.window.Node;
  globalAny['Element'] = dom.window.Element;
  globalAny['HTMLElement'] = dom.window.HTMLElement;

  if (dom.window.HTMLCanvasElement) {
    dom.window.HTMLCanvasElement.prototype.getContext = (() =>
      null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  }

  const results = await runAxe(dom.window.document.body);
  expect(results.violations).toEqual([]);
}

describe('Auditoría automatizada de accesibilidad WCAG AA (CA-7)', () => {
  it('Button no presenta violaciones de accesibilidad', async () => {
    await checkA11y(
      <div>
        <Button>Guardar cambios</Button>
        <Button variant="destructive">Eliminar documento</Button>
        <Button variant="outline">Cancelar</Button>
        <Button loading>Procesando</Button>
      </div>,
    );
  });

  it('Input con label asociado no presenta violaciones de accesibilidad', async () => {
    await checkA11y(
      <form>
        <label htmlFor="correo">Correo electrónico</label>
        <Input id="correo" type="email" placeholder="ejemplo@correo.com" />
      </form>,
    );
  });

  it('Card y Badge no presentan violaciones de accesibilidad', async () => {
    await checkA11y(
      <Card>
        <CardHeader>
          <CardTitle>Plan Pro</CardTitle>
          <CardDescription>Detalles de la suscripción</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="success">Activo</Badge>
          <Badge variant="warning">80% utilizado</Badge>
        </CardContent>
      </Card>,
    );
  });

  it('FileTypeChip y CitationChip no presentan violaciones de accesibilidad', async () => {
    await checkA11y(
      <div>
        <FileTypeChip extension="docx" />
        <FileTypeChip extension="pdf" />
        <CitationChip filename="especificacion.docx" location="pág. 3" />
      </div>,
    );
  });

  it('StateView en sus estados no presenta violaciones de accesibilidad', async () => {
    await checkA11y(
      <div>
        <StateView
          type="empty"
          title="Sin documentos"
          description="Sube tu primer archivo para comenzar"
          action={{ label: 'Subir archivo' }}
        />
        <StateView type="loading" title="Cargando tus datos..." />
        <StateView
          type="error"
          title="Error al cargar"
          description="Ocurrió un error inesperado al consultar la lista"
          action={{ label: 'Reintentar' }}
        />
      </div>,
    );
  });

  it('AppLayout con menú móvil abierto no presenta violaciones de accesibilidad', async () => {
    await checkA11y(
      <AppLayout initialMobileMenuOpen={true}>
        <div>Contenido de prueba</div>
      </AppLayout>,
    );
  });
});
