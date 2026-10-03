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

// «1)», «4.-», «6 )», «*2)*», «3:» o el emoji «1️⃣» al inicio de renglón. Los
// asteriscos y guiones bajos son las negritas y cursivas de WhatsApp.
const MARCA_PUNTO = /(?:^|\n)[ \t*_•]*([1-7])(?:️?⃣|[ \t]*(?:\)|\.-|\.|-|:))[*_]*/gu;

// La pregunta de cada punto del esqueleto, para quedarse solo con la respuesta.
const PREGUNTAS = {
  1: /correo(?:\s+electr[oó]nico)?\s*:?/i,
  2: /nombre\s+y\s+direcci[oó]n(?:\s+de\s+(?:su|tu)\s+trabajo)?\s*:?/i,
  3: /antig[uü]edad\s+laboral\s*:?/i,
  4: /nombre\s+y\s+tel[eé]fono\s+de\s+alg[uú]n\s+compa[ñn]ero[^\n:]*:?/i,
  5: /tiempo\s+viviendo\s+en\s+su\s+casa(?:\s+actual)?\s*:?/i,
  6: /nombre\s+y\s+tel[eé]fono\s+de\s+alg[uú]n\s+amigo[^\n:]*:?/i,
  7: /n[uú]mero\s+de\s+seguro\s+social\s*(?:\(\s*opcional\s*\))?\s*:?/i,
};

const NOMBRES_PUNTO = {
  1: 'correo',
  2: 'nombre y dirección del trabajo',
  3: 'antigüedad laboral',
  4: 'compañero de trabajo',
  5: 'tiempo viviendo en su casa',
  6: 'referencia (amigo, conocido o familiar)',
  7: 'número de seguro social',
};
// 10 dígitos con espacios, guiones o puntos en medio, y el +52 opcional.
const TELEFONO = /(?:\+?\s*52[\s.-]*)?\d(?:[\s.-]*\d){9}(?!\d)/g;
// La pregunta del esqueleto, que no es parte de la respuesta.
const PREGUNTA = /nombre\s+y\s+tel[eé]fono\s+de\s+alg[uú]n[^\n:]*:?/i;
// Parentescos y muletillas que no son parte del nombre. Los límites son \p{L}
// y no \b, porque \b no ve la «á» de «mamá» como letra.
const PARENTESCO =
  /(?<!\p{L})(mi|su|referencia|ref|compa[ñn]er[oa]|amig[oa]|herman[oa]|mam[aá]|pap[aá]|madre|padre|t[ií][oa]|prim[oa]|espos[oa]|cu[ñn]ad[oa]|vecin[oa]|abuel[oa]|hij[oa]|suegr[oa]|sobrin[oa]|novi[oa]|conocid[oa]|familiar)(?!\p{L})\s*:?/giu;

/**
 * Los puntos 1) a 7) del texto pegado, por número. Vacío si no viene numerado.
 *
 * Solo cuentan las marcas en orden creciente: «3-4 años» al inicio de un
 * renglón del punto 3 no abre un punto 3 nuevo.
 */
export function puntosDelFormulario(textoPegado) {
  const texto = String(textoPegado ?? '');
  const marcas = [];
  for (const marca of texto.matchAll(MARCA_PUNTO)) {
    const anterior = marcas.at(-1);
    if (!anterior || Number(marca[1]) > Number(anterior[1])) marcas.push(marca);
  }
  const puntos = {};
  marcas.forEach((marca, i) => {
    const desde = marca.index + marca[0].length;
    const hasta = i + 1 < marcas.length ? marcas[i + 1].index : texto.length;
    puntos[marca[1]] = texto.slice(desde, hasta);
  });
  return puntos;
}

/** La respuesta de un punto, sin la pregunta ni el formato de WhatsApp. */
export function respuestaDe(puntos, numero) {
  return String(puntos[numero] ?? '')
    .replace(PREGUNTAS[numero], ' ')
    .replace(/[*_]+/g, ' ')
    .split('\n')
    .map((renglon) => renglon.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * El texto que va a Gemini: el original y, si viene numerado, cada respuesta
 * ya separada con el nombre de su punto. Así no confunde la respuesta del 4
 * con la pregunta del 5 cuando el vendedor juntó o cortó renglones.
 */
export function textoParaGemini(textoPegado) {
  const original = String(textoPegado ?? '');
  const puntos = puntosDelFormulario(original);
  const numeros = Object.keys(puntos);
  if (numeros.length < 2) return original;
  const separados = numeros
    .map(
      (numero) =>
        `Punto ${numero} (${NOMBRES_PUNTO[numero]}): ${respuestaDe(puntos, numero) || '(sin respuesta)'}`,
    )
    .join('\n');
  return `${original}\n\n--- RESPUESTAS SEPARADAS POR PUNTO ---\n${separados}`;
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
 * Llena lo que Gemini dejó vacío con lo que se encuentra en el texto: correo,
 * trabajo, antigüedades, NSS y celular; el compañero (punto 4), la referencia
 * (punto 6) y, si el punto 6 trae más de una persona, las demás como
 * referencias extra. Nunca pisa lo que Gemini sí leyó.
 */
export function respaldoDelTexto(lectura, textoPegado) {
  const original = String(textoPegado ?? '');
  const puntos = puntosDelFormulario(original);
  const nueva = { ...(lectura ?? {}) };
  const llenar = (campo, valor) => {
    if (!texto(nueva[campo]) && texto(valor)) nueva[campo] = texto(valor);
  };

  // El correo se reconoce en cualquier parte, aunque no venga numerado.
  const correo = /[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(
    respuestaDe(puntos, 1) || original,
  );
  llenar('correo', correo?.[0].replace(/\s+/g, '').toLowerCase());

  // Trabajo: el primer renglón del punto 2, hasta la primera coma, es el negocio.
  llenar('empleo', respuestaDe(puntos, 2).split('\n')[0].split(/,|\s-\s/)[0]);
  llenar('antiguedad_laboral', respuestaDe(puntos, 3).split('\n')[0]);
  llenar('antiguedad_domicilio', respuestaDe(puntos, 5).split('\n')[0]);

  // NSS: 11 dígitos en el punto 7, con o sin espacios o guiones.
  const nss = /\d(?:[\s-]*\d){10}(?!\d)/.exec(respuestaDe(puntos, 7));
  llenar('nss', nss?.[0].replace(/\D/g, ''));

  // Celular del cliente: un teléfono que venga después de «cel» o «celular»,
  // fuera de los puntos de las personas.
  const sinPersonas = [puntos['4'], puntos['6']].reduce(
    (resto, bloque) => (bloque ? resto.replace(bloque, ' ') : resto),
    original,
  );
  const celular =
    /cel(?:ular)?\.?(?:\s+del\s+cliente)?\s*:?\s*((?:\+?\s*52[\s.-]*)?\d(?:[\s.-]*\d){9})(?!\d)/i.exec(
      sinPersonas,
    );
  llenar('celular', celular?.[1]);

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
