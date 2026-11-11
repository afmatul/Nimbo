import { previewPathOf } from './routes';

describe('rutas de preview, T-06', () => {
  it('CA-7: navega a la vista previa usando solo el fileId', () => {
    expect(previewPathOf('archivo-17')).toBe('/archivos/vista-previa/archivo-17');
  });

  it('Guardia transversal: codifica el ID y no agrega búsqueda ni fragmento', () => {
    const path = previewPathOf('a/b?nombre=privado#fragmento');
    expect(path).toBe('/archivos/vista-previa/a%2Fb%3Fnombre%3Dprivado%23fragmento');
    expect(new URL(path, 'https://web.test').search).toBe('');
    expect(new URL(path, 'https://web.test').hash).toBe('');
  });
});
