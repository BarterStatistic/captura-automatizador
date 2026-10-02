// Lleva los datos de venta que traiga el formulario del vendedor a la captura
// manual: celular, moto, esquema, plazo y las referencias 2 y 3.
//
// Solo llena lo que está vacío. Si el capturista ya eligió algo, eso manda: el
// formulario se puede volver a leer y no debe deshacer lo que se corrigió a mano.

import { ESQUEMAS_VENTA, PLAZOS, SUBESQUEMAS } from './esquemas.js';

const texto = (valor) => String(valor ?? '').trim();

/** Mayúsculas sin acentos, para comparar «Motoxpress flex» con «MOTOXPRESS FLEX». */
function normalizar(valor) {
  return texto(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/**
 * Busca en un catálogo la opción cuyo nombre aparece en el texto. Gana el
 * nombre más largo, para que «MOTOXPRESS FLEX» no se lea como «MOTOXPRESS».
 *
 * Si ningún nombre completo aparece, se acepta una abreviatura («JUBILADOS»
 * por «JUBILADOS Y PENSIONADOS»), pero solo si apunta a una sola opción.
 */
export function opcionPorNombre(catalogo, escrito) {
  const buscado = normalizar(escrito);
  if (!buscado) return null;

  const completas = catalogo
    .filter((opcion) => buscado.includes(normalizar(opcion.nombre)))
    .sort((a, b) => b.nombre.length - a.nombre.length);
  if (completas.length > 0) return completas[0];

  if (buscado.length < 4) return null;
  const abreviadas = catalogo.filter((opcion) => normalizar(opcion.nombre).includes(buscado));
  return abreviadas.length === 1 ? abreviadas[0] : null;
}

/** El `value` interno de Dinamo para un plazo en meses, o null. */
export function plazoPorMeses(meses) {
  const numero = Number(String(meses ?? '').replace(/\D/g, ''));
  return PLAZOS.find((plazo) => plazo.meses === numero)?.value ?? null;
}

/**
 * Devuelve una copia de `manual` con los huecos llenados desde la lectura del
 * formulario. Nunca sobrescribe un valor que ya tenga.
 */
export function extrasAlManual(manual, lectura) {
  if (!lectura) return manual;
  const nuevo = { ...manual };

  const llenar = (campo, valor) => {
    if (!texto(nuevo[campo]) && texto(valor)) nuevo[campo] = texto(valor);
  };

  llenar('celular', lectura.celular);
  llenar('modelo', lectura.modelo);
  llenar('color', lectura.color);
  llenar('anio', lectura.anio);
  llenar('esquemaVenta', opcionPorNombre(ESQUEMAS_VENTA, lectura.esquema)?.value);
  llenar('subesquema', opcionPorNombre(SUBESQUEMAS, lectura.subesquema)?.value);
  llenar('plazo', plazoPorMeses(lectura.plazo_meses));

  // La referencia 1 sale del punto 6 del formulario; las extra van a la 2 y 3,
  // que solo se capturan en MOTOXPRESS, pero se guardan igual por si cambia
  // el esquema después.
  const extra = Array.isArray(lectura.referencias_extra) ? lectura.referencias_extra : [];
  const referencias = { ...(nuevo.referencias ?? {}) };
  ['ref_b', 'ref_c'].forEach((sufijo, indice) => {
    const dato = extra[indice];
    if (!dato) return;
    const actual = referencias[sufijo] ?? {};
    referencias[sufijo] = {
      ...actual,
      nombreCompleto: texto(actual.nombreCompleto) || texto(dato.nombre),
      telefono: texto(actual.telefono) || texto(dato.telefono),
    };
  });
  nuevo.referencias = referencias;

  return nuevo;
}
