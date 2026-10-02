// Lleva los datos de venta que traiga el formulario del vendedor a la captura
// manual: celular, moto, esquema, plazo y las referencias 2 y 3.
//
// Solo llena lo que está vacío. Si el capturista ya eligió algo, eso manda: el
// formulario se puede volver a leer y no debe deshacer lo que se corrigió a mano.

import { ESQUEMAS_VENTA, SUBESQUEMAS, plazoValido } from './esquemas.js';
import { modeloPorNombre } from './motos.js';

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
  // Si el modelo está en el catálogo se usa el nombre del catálogo, que es el
  // que la extensión busca en Dinamo; si no, se deja lo escrito para que el
  // capturista lo vea y lo corrija.
  llenar('modelo', modeloPorNombre(lectura.modelo) ?? lectura.modelo);
  llenar('color', lectura.color);
  // Solo el año de cuatro cifras: «modelo 2026» es 2026, como en el menú.
  llenar('anio', /(?:^|\D)(20\d{2})(?!\d)/.exec(texto(lectura.anio))?.[1]);
  llenar('esquemaVenta', opcionPorNombre(ESQUEMAS_VENTA, lectura.esquema)?.value);
  llenar('subesquema', opcionPorNombre(SUBESQUEMAS, lectura.subesquema)?.value);
  // El plazo solo se toma si existe en el esquema: 24 sirve en quincenas, no
  // en semanas.
  llenar('plazo', plazoValido(nuevo.esquemaVenta, lectura.plazo));

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
