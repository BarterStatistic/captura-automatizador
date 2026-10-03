// Lleva lo que traiga el formulario del vendedor además de los siete puntos a
// la captura manual: celular, tipo de crédito y las referencias 2 y 3. La moto
// no: la captura el vendedor en Dinamo.
//
// Solo llena lo que está vacío. Si el capturista ya eligió algo, eso manda: el
// formulario se puede volver a leer y no debe deshacer lo que se corrigió a mano.

import { ESQUEMAS_VENTA } from './esquemas.js';

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
  llenar('esquemaVenta', opcionPorNombre(ESQUEMAS_VENTA, lectura.esquema)?.value);

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

// --- Respaldo: leer las personas directo del texto -------------------------------
//
// Gemini lee bien los formularios, pero si deja vacía una referencia o el
// compañero de trabajo, se buscan aquí en el texto pegado: cada teléfono de 10
// dígitos del punto, con el nombre que lo acompaña en el mismo renglón o en el
// de arriba.

// «1)», «4.-», «6 )» al inicio de renglón.
const MARCA_PUNTO = /(?:^|\n)[ \t]*([1-7])[ \t]*(?:\)|\.-|\.|-)/g;
// 10 dígitos con espacios, guiones o puntos en medio, y el +52 opcional.
const TELEFONO = /(?:\+?\s*52[\s.-]*)?\d(?:[\s.-]*\d){9}(?!\d)/g;
// La pregunta del esqueleto, que no es parte de la respuesta.
const PREGUNTA = /nombre\s+y\s+tel[eé]fono\s+de\s+alg[uú]n[^\n:]*:?/i;
// Parentescos y muletillas que no son parte del nombre. Los límites son \p{L}
// y no \b, porque \b no ve la «á» de «mamá» como letra.
const PARENTESCO =
  /(?<!\p{L})(mi|su|referencia|ref|compa[ñn]er[oa]|amig[oa]|herman[oa]|mam[aá]|pap[aá]|madre|padre|t[ií][oa]|prim[oa]|espos[oa]|cu[ñn]ad[oa]|vecin[oa]|abuel[oa]|hij[oa]|suegr[oa]|sobrin[oa]|novi[oa]|conocid[oa]|familiar)(?!\p{L})\s*:?/giu;

/** Los puntos 1) a 7) del texto pegado, por número. Vacío si no viene numerado. */
export function puntosDelFormulario(textoPegado) {
  const texto = String(textoPegado ?? '');
  const marcas = [...texto.matchAll(MARCA_PUNTO)];
  const puntos = {};
  marcas.forEach((marca, i) => {
    const desde = marca.index + marca[0].length;
    const hasta = i + 1 < marcas.length ? marcas[i + 1].index : texto.length;
    puntos[marca[1]] = texto.slice(desde, hasta);
  });
  return puntos;
}

function limpiarNombre(crudo) {
  return String(crudo ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(PARENTESCO, ' ')
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cada persona (nombre y teléfono) que aparece en el texto de un punto. */
export function personasEn(bloque) {
  const texto = String(bloque ?? '').replace(PREGUNTA, ' ');
  const telefonos = [...texto.matchAll(TELEFONO)];
  return telefonos.map((telefono, i) => {
    const inicio = i === 0 ? 0 : telefonos[i - 1].index + telefonos[i - 1][0].length;
    let nombre = limpiarNombre(texto.slice(inicio, telefono.index));
    // «844 123 4567 Luis Pérez»: el nombre viene después.
    if (!nombre) {
      const fin = i + 1 < telefonos.length ? telefonos[i + 1].index : texto.length;
      nombre = limpiarNombre(texto.slice(telefono.index + telefono[0].length, fin).split('\n')[0]);
    }
    return { nombre, telefono: telefono[0].trim() };
  });
}

/**
 * Llena lo que Gemini dejó vacío de las personas del formulario con lo que se
 * encuentra en el texto: el compañero (punto 4), la referencia (punto 6) y, si
 * el punto 6 trae más de una persona, las demás como referencias extra.
 */
export function respaldoDelTexto(lectura, textoPegado) {
  const puntos = puntosDelFormulario(textoPegado);
  const nueva = { ...(lectura ?? {}) };

  const [companero] = personasEn(puntos['4']);
  if (companero) {
    if (!texto(nueva.companero_telefono)) nueva.companero_telefono = companero.telefono;
    if (!texto(nueva.companero_nombre) && companero.nombre) nueva.companero_nombre = companero.nombre;
  }

  const [primera, ...demas] = personasEn(puntos['6']);
  if (primera) {
    if (!texto(nueva.referencia_telefono)) nueva.referencia_telefono = primera.telefono;
    if (!texto(nueva.referencia_nombre) && primera.nombre) nueva.referencia_nombre = primera.nombre;
  }
  const yaHayExtra = Array.isArray(nueva.referencias_extra) && nueva.referencias_extra.length > 0;
  if (!yaHayExtra && demas.length > 0) nueva.referencias_extra = demas;

  return nueva;
}
