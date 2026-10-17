// Corpus de ejemplo de la spec 012 (compartición y accesos): una sola fuente para las personas, los recursos y los
// textos que comparten sharing/compartir y sharing/compartido-conmigo. Datos sintéticos; en la app vienen de la API.
// La cuenta que mira es la del marco (Lucía Barrios, marco/marco.js): propietaria en «Compartir» y destinataria en
// «Compartido conmigo». Laura Barrios y Diego Coj son las del corpus de 011 (admin/corpus.js), para no inventar dos veces.
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const C = require('../carpetas/carpetas.js');
const AC = require('../admin/corpus.js');

// ---------- Personas (cuentas de cliente verificadas y activas, salvo Diego: sin verificar en 011) ----------
const iniciales = (nombre) => nombre.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
const persona = ({ nombre, correo }) => ({ nombre, correo, iniciales: iniciales(nombre) });
const YO = persona(M.CUENTA);
const LAURA = persona(AC.LAURA);
const DIEGO = persona(AC.DIEGO);
const SOFIA = persona({ nombre: 'Sofía Méndez', correo: 'sofia.mendez@gmail.com' });
const JAVIER = persona({ nombre: 'Javier Ajú', correo: 'javier.aju@outlook.com' });
const CARMEN = persona({ nombre: 'Carmen Tuyuc', correo: 'carmen.tuyuc@gmail.com' });

// ---------- Niveles (RN-1: solo Lector y Editor se asignan; Propietario nace de la propiedad) ----------
const NIVELES = {
  Lector: { icono: 'eye', puede: 'puede ver y descargar' },
  Editor: { icono: 'pencil', puede: 'además, puede editar y subir nuevas versiones' },
  Propietario: { icono: 'key' },
};

// ---------- Lado del propietario (Lucía comparte) ----------
// Mis archivos (raíz): las carpetas de 006 y los archivos de 005, con fechas de ejemplo.
const carpeta = (nombre, fecha, extra = {}) => ({ tipo: 'carpeta', nombre, tam: '', fecha, ...extra });
const archivo = ([nombre, tam, fecha], extra = {}) => ({ tipo: 'archivo', nombre, tam, fecha, ...extra });
const ALPHA = C.CARPETAS_RAIZ[0]; // «Proyecto Alpha»: la carpeta que Lucía comparte
const BETA = 'Proyecto Beta · Diseño'; // carpeta que Laura le comparte a Lucía
const NIVEL_BETA = 'Editor'; // nivel de Lucía en Proyecto Beta (directo) y en lo que contiene (heredado)
const INFORME_Q3 = 'Informe_trimestral_Q3.docx';
// Accesos rápidos de Lucía: fijados y recientes mezclan lo propio y lo compartido (CA-17, RN-13).
const ACCESOS_RAPIDOS = {
  fijados: [['carpeta', ALPHA], ['carpeta', BETA], ['archivo', S.RAIZ[0][0]]],
  recientes: [['archivo', INFORME_Q3], ['archivo', S.RAIZ[3][0]], ['carpeta', 'Fase 3 · RAG']],
};
const fijado = (nombre) => ACCESOS_RAPIDOS.fijados.some(([, n]) => n === nombre);
const FECHAS_RAIZ = ['hace 1 h', '18 sep', 'ayer'];
const RAIZ = [
  ...C.CARPETAS_RAIZ.map((n, i) => carpeta(n, FECHAS_RAIZ[i], { fijado: fijado(n) })),
  ...S.RAIZ.map((a) => archivo(a, { fijado: fijado(a[0]) })),
];
const PLAN_TRABAJO = 'Plan_de_trabajo.docx'; // archivo dentro de Proyecto Alpha: hereda sus accesos
const EN_ALPHA = [
  carpeta('Actas', '2 ago'), carpeta('Documentación', '27 sep'), carpeta('Fase 3 · RAG', 'hace 20 min'),
  archivo([PLAN_TRABAJO, '210 KB', '30 sep']),
];
// Accesos de Proyecto Alpha (de lo más reciente a lo más antiguo). Laura se agrega hoy en el estado «agregando».
const acceso = (p, nivel, desde) => ({ ...p, nivel, desde });
const ACCESOS_ALPHA = [acceso(LAURA, 'Editor', 'hoy'), acceso(SOFIA, 'Lector', '14 oct 2026'), acceso(JAVIER, 'Lector', '10 oct 2026')];
// Plan_de_trabajo.docx: directos propios y los heredados de Proyecto Alpha. Sofía tiene ambos: rige Editor (CA-20, RN-6).
const DIRECTOS_PLAN = [acceso(SOFIA, 'Editor', '16 oct 2026'), acceso(CARMEN, 'Lector', '15 oct 2026')];

// ---------- Lado del destinatario (a Lucía le comparten) ----------
// directo: compartición directa (ofrece «Salir»); fijado: está en sus Accesos rápidos (CA-17).
const CONTRATO = 'Contrato_servicios_2026.pdf';
const COMPARTIDO = [
  carpeta(BETA, 'hoy · 09:40', { duenio: LAURA, nivel: NIVEL_BETA, directo: true, fijado: fijado(BETA) }),
  archivo([INFORME_Q3, '3.1 MB', 'ayer'], { duenio: SOFIA, nivel: 'Editor', directo: true }),
  archivo([CONTRATO, '1.4 MB', '14 oct'], { duenio: JAVIER, nivel: 'Lector', directo: true }),
  carpeta('Fotos del taller', '9 oct', { duenio: CARMEN, nivel: 'Lector', directo: true }),
  archivo(['Presupuesto_evento.xlsx', '96 KB', '2 oct'], { duenio: JAVIER, nivel: 'Lector', directo: true }),
];
// Subcarpeta «Entregables» de Proyecto Beta: todo heredado (sin «Salir», CA-16), con el nivel efectivo.
const RUTA_ENTREGABLES = ['Compartido conmigo', BETA, 'Entregables'];
const EN_ENTREGABLES = [
  carpeta('Revisiones', 'ayer', { nivel: NIVEL_BETA }),
  archivo(['Manual_de_marca.pdf', '6.2 MB', 'hoy · 08:15'], { nivel: NIVEL_BETA }),
  archivo(['Propuesta_visual_v2.docx', '1.9 MB', '15 oct'], { nivel: NIVEL_BETA }),
  archivo(['Presentacion_cliente.pptx', '12.4 MB', '13 oct'], { nivel: NIVEL_BETA }),
];
// Nueva versión de Informe_trimestral_Q3.docx: la elige Lucía (Editora) desde su equipo; el plan de Sofía (Personal)
// conserva 3 versiones y el archivo ya tiene 3 (014 CA-13 y CA-15).
const VERSION_NUEVA = { local: 'Informe_Q3_revisado_LB.docx', tam: '3.4 MB', subido: '2.0 MB', pct: 59 };
const RETENIDAS_DUENIO = AC.PERSONAL.versiones;

// ---------- Textos de la spec (§3 y §6), tal cual ----------
const TEXTOS = {
  correoGenerico: (correo) => `No pudimos compartir con ${correo}. Revisa que sea el correo de una cuenta de Nimbo activa.`,
  propio: 'Este elemento ya es tuyo.',
  yaTiene: (nombre) => `${nombre} ya tiene acceso. Cambia su nivel en la lista.`,
  intentos: (n) => `Hiciste muchos intentos. Espera ${n} minutos y vuelve a intentarlo.`,
  // « y lo que contiene» solo si el recurso es una carpeta (§6)
  revocar: (quien, { tipo, nombre }) => `${quien} dejará de ver «${nombre}»${tipo === 'carpeta' ? ' y lo que contiene' : ''}.`,
  salir: (nombre) => `Dejarás de ver «${nombre}». Para recuperarlo, quien lo compartió tendrá que compartirlo de nuevo.`,
  vacioTitulo: 'Aún no te han compartido nada.',
  vacioTexto: 'Cuando alguien comparta un archivo o una carpeta contigo, aparecerá aquí.',
  noDisponibleTitulo: 'Este elemento ya no está disponible.',
  noDisponibleTexto: 'Puede que hayan dejado de compartirlo contigo.',
  volver: 'Volver a Compartido conmigo',
  espacioDuenio: 'La cuenta de quien lo compartió no tiene espacio para esta versión. Avísale para que libere espacio.',
};

module.exports = {
  YO, LAURA, DIEGO, CARMEN, NIVELES,
  RAIZ, ALPHA, PLAN_TRABAJO, EN_ALPHA, ACCESOS_ALPHA, DIRECTOS_PLAN,
  NIVEL_BETA, INFORME_Q3, CONTRATO, COMPARTIDO, RUTA_ENTREGABLES, EN_ENTREGABLES, VERSION_NUEVA, RETENIDAS_DUENIO,
  ACCESOS_RAPIDOS, TEXTOS,
};
