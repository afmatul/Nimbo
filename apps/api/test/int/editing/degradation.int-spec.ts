import { docxBytes } from './docx-bytes';
import { uploadDocx } from './edited-version-world';
import { createEditingHttpApp } from './editing-http';
import type { EditingHttpApp } from './editing-http';

/** Abrir sin editor responde 503 y lo demás de `storage` sigue igual (016 CA-15, RNF-09, Art. XII). */
const expectStorageStillWorks = async (editing: EditingHttpApp): Promise<void> => {
  const ana = await editing.storage.newClient();
  const { fileId } = await uploadDocx(editing.storage, ana);

  const opened = await editing.open(ana, fileId);
  const listed = await ana.folderContents();
  const download = await ana.downloadUrl(fileId);
  const uploaded = await ana.upload('otro.docx', docxBytes());

  expect(opened.status).toBe(503);
  expect(opened.body).toMatchObject({
    code: 'EDITING_UNAVAILABLE',
    message: expect.stringContaining('Tus archivos siguen a salvo') as unknown,
  });
  expect(listed.status).toBe(200);
  expect(download.status).toBe(200);
  expect(uploaded.status).toBe(200);
  const [row] = await editing.storage.owner.query<{ n: number }[]>(
    'SELECT count(*)::int AS n FROM sesion_edicion WHERE archivo_id = $1',
    [fileId],
  );
  expect(row?.n).toBe(0);
};

describe('servicio de edición caído (016 CA-15)', () => {
  let editing: EditingHttpApp;

  beforeAll(async () => {
    editing = await createEditingHttpApp();
    editing.editor.available = false;
  });

  afterAll(async () => {
    await editing?.close();
  });

  it('CA-15: ONLYOFFICE no responde → `EDITING_UNAVAILABLE` (503); listar, descargar y subir siguen igual', async () => {
    await expectStorageStillWorks(editing);
  });
});

describe('`api` sin las variables de ONLYOFFICE (016 CA-15, plan §5)', () => {
  let editing: EditingHttpApp;

  beforeAll(async () => {
    editing = await createEditingHttpApp({
      realEditor: true,
      env: {
        ONLYOFFICE_JWT_SECRET: '',
        ONLYOFFICE_PUBLIC_URL: '',
        ONLYOFFICE_INTERNAL_URL: '',
        EDITING_CALLBACK_BASE_URL: '',
      },
    });
  });

  afterAll(async () => {
    await editing?.close();
  });

  it('CA-15: el `api` arranca y abrir responde `EDITING_UNAVAILABLE`; lo demás sigue igual', async () => {
    await expectStorageStillWorks(editing);
  });

  it('CA-15: sin clave no hay enlaces de contenido: cualquier token es el 404 uniforme', async () => {
    const response = await editing.content('cualquier-token');

    expect(response.status).toBe(404);
  });
});
