// Corpus de ejemplo del área de administración (spec 011): una sola fuente para los planes y los conteos que muestran
// la navegación (Cuentas), el catálogo y las métricas, para que no se desvíen entre pantallas. En la app vienen de la API.
// Planes: los cuatro oficiales con sus valores reales (product-context §3; semilla de 006a, creada el 28/09/2026); precios
// y tamaños ya formateados como en la web (ADR-0016). cuentas: conteo agregado por plan, nunca nombres.

const PERSONAL = { id: 'personal', nombre: 'Personal', descripcion: 'Plan gratuito para uso individual con almacenamiento básico',
  precio: 'Q0.00', espacio: '15 GB', archivo: '50 MB', editores: 0, consultas: 20, versiones: 3, papelera: 7,
  cuentas: 1012, creado: '28/09/2026', porDefecto: true };
const PRO = { id: 'pro', nombre: 'Pro', descripcion: 'Plan profesional para usuarios exigentes con edición colaborativa',
  precio: 'Q45.00', espacio: '100 GB', archivo: '500 MB', editores: 3, consultas: 500, versiones: 30, papelera: 30,
  cuentas: 186, creado: '28/09/2026' };
const EQUIPO = { id: 'equipo', nombre: 'Equipo', descripcion: 'Plan para equipos de trabajo con colaboración en tiempo real',
  precio: 'Q110.00', espacio: '350 GB', archivo: '1 GB', editores: 5, consultas: 2000, versiones: 60, papelera: 60,
  cuentas: 52, creado: '28/09/2026' };
const INSTITUCIONAL = { id: 'institucional', nombre: 'Institucional', descripcion: 'Plan de máxima capacidad para organizaciones e instituciones',
  precio: 'Q450.00', espacio: '2 TB', archivo: '2 GB', editores: 5, consultas: 10000, versiones: 100, papelera: 90,
  cuentas: 22, creado: '28/09/2026' };
// Plan nuevo de ejemplo (CA-9): parte de Equipo con más espacio y más consultas, para reemplazarlo; aún sin cuentas.
const PLAN_NUEVO = { id: 'equipo-2027', nombre: 'Equipo 2027', descripcion: 'Para equipos que necesitan más espacio, con colaboración en tiempo real',
  precio: 'Q125.00', espacio: '500 GB', archivo: '1 GB', editores: 5, consultas: 3000, versiones: 60, papelera: 60,
  cuentas: 0, creado: '03/10/2026' };

// Catálogo antes y después de desactivar Equipo (catalogo--desactivado y metricas--con-plan-inactivo: el mismo momento).
const PLANES = [PERSONAL, PRO, EQUIPO, INSTITUCIONAL];
const PLANES_TRAS_DESACTIVAR = { activos: [PERSONAL, PRO, PLAN_NUEVO, INSTITUCIONAL], inactivos: [EQUIPO], fecha: '03/10/2026' };

const INTERNAS = 12;
const SUSPENDIDAS = 9;
const CLIENTES = PLANES.reduce((suma, p) => suma + p.cuentas, 0);
const TOTAL_CUENTAS = CLIENTES + INTERNAS;
// Desactivar un plan no mueve cuentas: las de después suman lo mismo que las de antes.
const cuentasTras = [...PLANES_TRAS_DESACTIVAR.activos, ...PLANES_TRAS_DESACTIVAR.inactivos].reduce((suma, p) => suma + p.cuentas, 0);
if (cuentasTras !== CLIENTES) throw new Error('El catálogo tras desactivar no suma los mismos clientes');

// Personas que aparecen en más de una pantalla (las demás cuentas de la lista viven en admin/generar.js). Las internas
// no tienen plan ni espacio (no tienen suscripción ni cuota). ficha: mockup de su ficha en backoffice/admin.
const MONICA = { nombre: 'Mónica Herrera', iniciales: 'MH', correo: 'monica.herrera@nimbo.gt', rol: 'Administrador',
  codigo: 'EMP-0001', alta: '28/08/2026', ficha: 'admin--propia-cuenta.html' };
const ANDREA = { nombre: 'Andrea Ruiz', iniciales: 'AR', correo: 'andrea.ruiz@nimbo.gt', rol: 'Soporte', codigo: 'EMP-0118',
  alta: '28/09/2026' };
const PABLO = { nombre: 'Pablo Xicará', iniciales: 'PX', correo: 'pablo.xicara@nimbo.gt', rol: 'Operador', codigo: 'EMP-0097',
  alta: '10/09/2026' };
const LAURA = { nombre: 'Laura Barrios', correo: 'laura.barrios@alpha.gt', rol: 'Cliente', plan: EQUIPO, usado: '304 GB',
  pct: 87, alta: '01/09/2026', ficha: 'admin--ficha.html' };
const DIEGO = { nombre: 'Diego Coj', correo: 'diego.coj@gmail.com', rol: 'Cliente', plan: PERSONAL, usado: '0 B', pct: 0,
  alta: '02/10/2026', verificada: false };

// Formato de la web: miles separados por un espacio que no se parte (U+00A0), para que una cifra no se corte en dos líneas.
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

module.exports = {
  PERSONAL, PRO, EQUIPO, INSTITUCIONAL, PLAN_NUEVO, PLANES, PLANES_TRAS_DESACTIVAR,
  INTERNAS, SUSPENDIDAS, CLIENTES, TOTAL_CUENTAS, MONICA, ANDREA, PABLO, LAURA, DIEGO, miles,
};
