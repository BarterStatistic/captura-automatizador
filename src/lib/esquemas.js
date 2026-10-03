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

// Lo que pide cada tipo de crédito (regla de Dinamo, decidida con Braulio el
// 2026-10-03):
//
//   MOTONOMINA, MOTONOMINA FLEX, CREDINAMO y CREDINAMO FLEX:
//     INE, comprobante de domicilio, un comprobante de ingresos y el formulario
//     con una referencia laboral (el compañero) y una personal.
//   MOTOXPRESS y MOTOXPRESS FLEX:
//     INE, comprobante de domicilio y el formulario con una referencia laboral
//     y tres personales. No piden comprobante de ingresos.
const MOTOXPRESS = new Set(['15', '51']);

const SUFIJOS = ['ref', 'ref_b', 'ref_c'];

export function esquemaPorValue(value) {
  return ESQUEMAS_VENTA.find((esquema) => esquema.value === String(value)) ?? null;
}

/** ¿Este tipo de crédito pide comprobante de ingresos? Sin tipo elegido, sí. */
export function pideIngresos(valueEsquema) {
  return !MOTOXPRESS.has(String(valueEsquema));
}

/**
 * Sufijos de las secciones de referencia personal que hay que capturar y
 * llenar: tres en MOTOXPRESS, una en los demás.
 *
 * Un esquema desconocido cae en una sola referencia: es el mínimo que el
 * formulario exige siempre, así que equivocarse por ahí no inventa trabajo.
 */
export function referenciasRequeridas(valueEsquema) {
  return MOTOXPRESS.has(String(valueEsquema)) ? [...SUFIJOS] : [SUFIJOS[0]];
}

/** Lo que pide el tipo de crédito, en una frase para el capturista. */
export function requisitosEnTexto(valueEsquema) {
  const personales = referenciasRequeridas(valueEsquema).length;
  const documentos = pideIngresos(valueEsquema)
    ? 'INE, comprobante de domicilio y comprobante de ingresos'
    : 'INE y comprobante de domicilio';
  return (
    `Pide ${documentos}, y el formulario con 1 referencia laboral y ` +
    `${personales} referencia${personales === 1 ? '' : 's'} personal${personales === 1 ? '' : 'es'}.`
  );
}
