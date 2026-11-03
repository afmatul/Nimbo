import { receivedFileType } from './received-file-type';

describe('receivedFileType (spec 012b CA-8: el tipo de cada elemento)', () => {
  it.each([
    ['Informe.DOCX', 'docx'],
    ['Presupuesto.xlsx', 'xlsx'],
    ['Foto.jpeg', 'img'],
    ['notas.md', 'text'],
    ['Manual.pdf', 'pdf'],
    ['setup.exe', 'other'],
    ['SinExtension', 'other'],
  ])('CA-8: «%s» es %s', (name, type) => {
    expect(receivedFileType(name)).toBe(type);
  });
});
