import type { FileKind } from '@nimbo/contracts';

import type { SearchedChunk } from '../../src/modules/intelligence/application/ports/i-chunk-search.port';
import type {
  Embedding,
  IEmbeddingProvider,
} from '../../src/modules/intelligence/application/ports/i-embedding-provider.port';
import type { ITextExtractor } from '../../src/modules/intelligence/application/ports/i-text-extractor.port';
import { Chunker } from '../../src/modules/intelligence/domain/chunker';
import { DocxExtractor } from '../../src/modules/intelligence/infrastructure/extractors/docx.extractor';
import { PlainTextExtractor } from '../../src/modules/intelligence/infrastructure/extractors/plain-text.extractor';
import { PptxExtractor } from '../../src/modules/intelligence/infrastructure/extractors/pptx.extractor';
import { XlsxExtractor } from '../../src/modules/intelligence/infrastructure/extractors/xlsx.extractor';
import { buildDocx } from '../support/docx-fixture';
import { buildPptx } from '../support/pptx-fixture';
import { buildXlsx } from '../support/xlsx-fixture';

/**
 * Corpus sintético de medición (020 S-5): documentos de una empresa ficticia generados con los *fixtures* de
 * `test/support` y pasados por los extractores y el `Chunker` reales, como los indexaría el `worker`. Sin PDF: su
 * extractor necesita Ghostscript y no cambia la latencia del agente. Nada de esto se imprime.
 */
interface MeasurementDocument {
  readonly fileName: string;
  readonly kind: FileKind;
  readonly content: Buffer;
}

/** Fragmento del corpus con su vector `document`, listo para la búsqueda en memoria. */
export interface MeasuredChunk {
  readonly chunk: SearchedChunk;
  readonly vector: Embedding;
}

const VACATION_POLICY = buildDocx([
  { heading: 1, text: 'Política de vacaciones y trabajo remoto' },
  { heading: 2, text: 'Vacaciones' },
  {
    text: 'Cada colaborador tiene derecho a 15 días hábiles de vacaciones pagadas por año laborado.',
  },
  {
    text: 'Las vacaciones se solicitan con al menos 10 días de anticipación mediante el formulario RH-07.',
  },
  {
    text: 'Se pueden acumular como máximo 30 días; lo que exceda se pierde al cierre del año fiscal.',
  },
  { heading: 2, text: 'Trabajo remoto' },
  {
    text: 'El trabajo remoto se permite dos días por semana, acordados con la jefatura inmediata.',
  },
  {
    text: 'Los viáticos por viaje de trabajo se reembolsan hasta 250 quetzales diarios con factura.',
  },
]);

const SALES_2026 = buildXlsx([
  {
    name: 'Trimestre 1',
    rows: [
      ['Región', 'Ventas (Q)', 'Meta (Q)'],
      ['Occidente', 410000, 400000],
      ['Oriente', 298000, 350000],
      ['Central', 655000, 600000],
    ],
  },
  {
    name: 'Trimestre 2',
    rows: [
      ['Región', 'Ventas (Q)', 'Meta (Q)'],
      ['Occidente', 432000, 420000],
      ['Oriente', 371000, 360000],
      ['Central', 702000, 650000],
    ],
  },
]);

const QUETZAL_PROJECT = buildPptx([
  { shapes: [['Proyecto Quetzal'], ['Migración del inventario a la nube']] },
  { shapes: [['Objetivo'], ['Migrar el sistema de inventario a la nube antes de marzo de 2027.']] },
  {
    shapes: [
      ['Presupuesto'],
      ['El presupuesto aprobado es de 480 000 quetzales para todo el proyecto.'],
    ],
  },
  {
    shapes: [
      ['Equipo'],
      ['Lidera el proyecto Lucía Herrera, con cuatro analistas y un arquitecto.'],
    ],
  },
  {
    shapes: [
      ['Riesgos'],
      ['El principal riesgo es la conectividad de las bodegas de Quetzaltenango.'],
    ],
  },
]);

const SUPPORT_MANUAL = Buffer.from(
  [
    '# Manual de soporte técnico',
    '',
    'El soporte atiende de lunes a sábado de 7:00 a 19:00, hora de Guatemala.',
    'Un incidente crítico recibe respuesta en un máximo de 2 horas; uno normal, en 1 día hábil.',
    'Las contraseñas del sistema interno se cambian cada 90 días y deben tener al menos 12 caracteres.',
    'Para reportar un equipo dañado se abre un ticket en la mesa de ayuda con el número de inventario.',
  ].join('\n'),
);

const COMMITTEE_MINUTES = Buffer.from(
  [
    'Acta del comité de compras, sesión del 3 de octubre de 2026.',
    'Se aprobó cambiar el proveedor de café a la Finca El Mirador por mejor precio y calidad.',
    'Se pospuso la compra de cinco vehículos de reparto hasta el próximo año fiscal.',
    'La próxima reunión del comité será el 14 de noviembre de 2026 a las 9:00.',
  ].join('\n'),
);

const DOCUMENTS: readonly MeasurementDocument[] = [
  { fileName: 'politica-vacaciones.docx', kind: 'docx', content: VACATION_POLICY },
  { fileName: 'ventas-2026.xlsx', kind: 'xlsx', content: SALES_2026 },
  { fileName: 'proyecto-quetzal.pptx', kind: 'pptx', content: QUETZAL_PROJECT },
  { fileName: 'manual-soporte.md', kind: 'texto', content: SUPPORT_MANUAL },
  { fileName: 'acta-comite.txt', kind: 'texto', content: COMMITTEE_MINUTES },
];

/** CA-2: 20 preguntas que el corpus responde; miden la latencia y la similitud de lo que sí está. */
export const ANSWERABLE_QUESTIONS: readonly string[] = [
  '¿Cuántos días de vacaciones tengo al año?',
  '¿Con cuánta anticipación debo pedir vacaciones?',
  '¿Qué formulario uso para solicitar vacaciones?',
  '¿Cuántos días de vacaciones puedo acumular?',
  '¿Cuántos días a la semana puedo trabajar desde casa?',
  '¿Cuál es el tope de viáticos diarios?',
  '¿Cuánto vendió la región Central en el primer trimestre?',
  '¿Qué región no alcanzó su meta en el primer trimestre?',
  '¿Cuánto vendió Oriente en el segundo trimestre?',
  '¿Cuál es el objetivo del Proyecto Quetzal?',
  '¿Cuál es el presupuesto del Proyecto Quetzal?',
  '¿Quién lidera el Proyecto Quetzal?',
  '¿Cuál es el principal riesgo del proyecto de migración?',
  '¿En qué horario atiende soporte técnico?',
  '¿En cuánto tiempo responden un incidente crítico?',
  '¿Cada cuánto se cambian las contraseñas?',
  '¿Cómo reporto un equipo dañado?',
  '¿Qué proveedor de café se aprobó?',
  '¿Qué compra se pospuso en el comité?',
  '¿Cuándo es la próxima reunión del comité de compras?',
];

/** CA-3: preguntas que el corpus no responde, algunas del mismo dominio (licencias, sueldos) para que el corte sea exigente. */
export const UNANSWERABLE_QUESTIONS: readonly string[] = [
  '¿Cuántos días de licencia por paternidad me corresponden?',
  '¿Cuál es el salario mínimo del puesto de analista?',
  '¿Quién es el gerente general de la empresa?',
  '¿Cuál es la capital de Noruega?',
  '¿Cómo se prepara un pan de banano?',
  '¿Qué es la fotosíntesis?',
  '¿Quién ganó el último mundial de fútbol?',
  '¿Cuál es la distancia de la Tierra a la Luna?',
  '¿Cómo cambio el aceite de una motocicleta?',
  '¿Qué lenguaje de programación es mejor para videojuegos?',
];

const EXTRACTORS: readonly ITextExtractor[] = [
  new DocxExtractor(),
  new XlsxExtractor(),
  new PptxExtractor(),
  new PlainTextExtractor(),
];

function extractorFor(kind: FileKind): ITextExtractor {
  const extractor = EXTRACTORS.find((candidate) => candidate.kind === kind);
  if (extractor === undefined) throw new Error(`Sin extractor de medición para «${kind}»`);
  return extractor;
}

/** Fragmentos de un documento con ids sintéticos y su procedencia en JSON, como los guarda la 019. */
async function chunksOf(document: MeasurementDocument, index: number): Promise<SearchedChunk[]> {
  const segments = await extractorFor(document.kind).extract(document.content);
  return new Chunker().split(segments).map((chunk) => ({
    id: `fragmento-${String(index)}-${String(chunk.order)}`,
    fileId: `archivo-${String(index)}`,
    versionId: `version-${String(index)}`,
    fileName: document.fileName,
    order: chunk.order,
    text: chunk.text,
    location: chunk.location.toJson(),
  }));
}

/** Documentos del corpus extraídos, fragmentados y vectorizados (`task: 'document'`, como el `worker`). */
export async function buildMeasurementCorpus(
  embeddings: IEmbeddingProvider,
): Promise<{ documents: number; chunks: readonly MeasuredChunk[] }> {
  const perDocument = await Promise.all(DOCUMENTS.map(chunksOf));
  const chunks = perDocument.flat();
  const vectors = await embeddings.embed(
    chunks.map((chunk) => chunk.text),
    'document',
  );
  return {
    documents: DOCUMENTS.length,
    chunks: chunks.map((chunk, index) => ({ chunk, vector: vectors[index] ?? [] })),
  };
}
