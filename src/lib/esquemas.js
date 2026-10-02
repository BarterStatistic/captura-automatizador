// Catálogo de esquemas de venta y la regla de cuántas referencias pide cada uno.
//
// Los `value` están tomados del `<select id="cmbEsquemaVenta">` del HTML real de
// Dinamo. Se guardan aquí porque la app necesita saber, antes de llamar a nadie,
// cuántas referencias pedirle al capturista.

export const ESQUEMAS_VENTA = [
  { value: '1', nombre: 'CREDINAMO' },
  { value: '53', nombre: 'CREDINAMO FLEX' },
  { value: '19', nombre: 'DINAMO NOMINA' },
  { value: '2', nombre: 'MOTONOMINA' },
  { value: '52', nombre: 'MOTONOMINA FLEX' },
  { value: '15', nombre: 'MOTOXPRESS' },
  { value: '51', nombre: 'MOTOXPRESS FLEX' },
];

// Los tipos de crédito que se eligen al empezar cada captura, en el orden en
// que los nombra el equipo. Es un subconjunto de ESQUEMAS_VENTA: DINAMO NOMINA
// sigue en el catálogo (el formulario la puede mencionar) pero no se ofrece.
// MOTONOMINA FLEX es el value 52 del `<select>` real (HTML del 2026-10-02).
export const TIPOS_CREDITO = ['2', '52', '1', '53', '15', '51'].map((value) =>
  ESQUEMAS_VENTA.find((esquema) => esquema.value === value),
);

export const TIPOS_VENTA = [
  { value: '1', nombre: 'CREDITO' },
  { value: '2', nombre: 'CONTADO' },
];

export const TIPOS_UNIDAD = [
  { value: '1', nombre: 'NUEVA' },
  { value: '2', nombre: 'SEMINUEVA' },
];

export const SUBESQUEMAS = [
  { value: '9', nombre: 'JUBILADOS Y PENSIONADOS' },
  { value: '10', nombre: 'ASALARIADO' },
  { value: '11', nombre: 'PERSONAL DE SEGURIDAD' },
  { value: '12', nombre: 'HOME OFFICE' },
  { value: '13', nombre: 'ESQUEMA 50' },
  { value: '14', nombre: 'DUEÑO DE NEGOCIO ESQ. 50' },
  { value: '29', nombre: 'BURÓCRATAS FEDERAL' },
  { value: '30', nombre: 'BURÓCRATAS ESTATAL' },
  { value: '31', nombre: 'BURÓCRATAS MUNICIPAL' },
];

// Los dos esquemas de MOTOXPRESS exigen tres referencias; el resto se conforma
// con una. Es regla de negocio de Dinamo, no algo que se lea del formulario.
const TRES_REFERENCIAS = new Set(['15', '51']);

const SUFIJOS = ['ref', 'ref_b', 'ref_c'];

export function esquemaPorValue(value) {
  return ESQUEMAS_VENTA.find((esquema) => esquema.value === String(value)) ?? null;
}

/**
 * Sufijos de las secciones de referencia que hay que capturar y llenar.
 *
 * Un esquema desconocido cae en una sola referencia: es el mínimo que el
 * formulario exige siempre, así que equivocarse por ahí no inventa trabajo.
 */
export function referenciasRequeridas(valueEsquema) {
  return TRES_REFERENCIAS.has(String(valueEsquema)) ? [...SUFIJOS] : [SUFIJOS[0]];
}
