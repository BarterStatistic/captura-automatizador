// Lleva lo que traiga el formulario del vendedor además de los puntos numerados a
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

// --- Leer el formulario por sus preguntas ------------------------------------------
//
// El vendedor manda uno de dos esqueletos. Se reconocen por el TEXTO de cada
// pregunta, no solo por su número, porque el cliente a veces responde sin
// respetar los renglones y el esqueleto ha cambiado de orden:
//
//   NUEVO (10 puntos, «FORMULARIO PARA CRÉDITO»)
//     1) Correo electrónico                     6) Antigüedad laboral
//     2) Nombre de su trabajo                   7) Nombre, apellido y teléfono de
//     3) Puesto en su trabajo                      algún compañero de su trabajo
//     4) Dirección de su trabajo                8) Tiempo viviendo en su casa actual
//     5) Horario para recibir en visitas        9) Horario para recibir visita en domicilio
//                                              10) Nombre, apellido y teléfono de algún
//                                                  amigo, conocido o familiar
//
//   ANTERIOR (7 puntos)
//     1) Correo  2) Nombre y dirección (del trabajo)  3) Antigüedad laboral
//     4) Compañero  5) Tiempo en su casa  6) Amigo o familiar  7) NSS (opcional)
//
// En el esqueleto nuevo cada pregunta lleva su emoji, y la respuesta a veces va
// en el mismo renglón SIN dos puntos («Nombre de su trabajo Tornillos del Norte»).

// «1)», «4.-», «6 )», «*2)*», «3:», el emoji «1️⃣» o el «🔟» al inicio de renglón.
// Los asteriscos y guiones bajos son las negritas y cursivas de WhatsApp.
const MARCA_PUNTO =
  /(?:^|\n)[ \t*_•]*(?:(10|[1-9])(️?⃣|[ \t]*(?:\)|\.-|\.|-|:))|(1️?⃣0️?⃣|\u{1F51F}))[*_]*/gu;

const MAXIMO_PUNTOS = 10;

/**
 * Las marcas de punto del texto, en orden.
 *
 * Una marca cuenta solo si no es parte de una respuesta: «3-4 años» o «6 - 18»
 * al inicio de un renglón NO abren un punto. Para eso se prefieren las marcas
 * consecutivas (1, 2, 3…), y se descartan las que tras «.» o «-» traen un dígito
 * pegado.
 */
function marcasDelTexto(texto) {
  const candidatas = [];
  for (const marca of texto.matchAll(MARCA_PUNTO)) {
    const numero = marca[1] ? Number(marca[1]) : 10;
    if (numero > MAXIMO_PUNTOS) continue;
    const separador = marca[2] ?? '';
    const siguiente = texto.charAt(marca.index + marca[0].length);
    if (/[.-]$/.test(separador) && /\d/.test(siguiente)) continue;
    candidatas.push({ numero, index: marca.index, largo: marca[0].length });
  }

  const consecutivas = [];
  let esperado = 1;
  for (const marca of candidatas) {
    if (marca.numero === esperado) {
      consecutivas.push(marca);
      esperado += 1;
    }
  }
  const crecientes = [];
  for (const marca of candidatas) {
    const anterior = crecientes.at(-1);
    if (!anterior || marca.numero > anterior.numero) crecientes.push(marca);
  }
  return consecutivas.length >= crecientes.length - 1 ? consecutivas : crecientes;
}

/**
 * Los puntos del texto pegado, por número. Vacío si no viene numerado.
 *
 * Solo cuentan las marcas en orden: «3-4 años» al inicio de un renglón del punto
 * 3 no abre un punto 3 nuevo.
 */
export function puntosDelFormulario(textoPegado) {
  const texto = String(textoPegado ?? '');
  const marcas = marcasDelTexto(texto);
  const puntos = {};
  marcas.forEach((marca, i) => {
    const desde = marca.index + marca.largo;
    const hasta = i + 1 < marcas.length ? marcas[i + 1].index : texto.length;
    puntos[marca.numero] = texto.slice(desde, hasta);
  });
  return puntos;
}

// Emojis, ZWJ, selectores de variación y las barras «|» que separan 👨 | 👩.
const ADORNOS = /[\p{Extended_Pictographic}️‍⃣|]/gu;

/** Un bloque sin emojis, sin el formato de WhatsApp y con un renglón por línea. */
function limpiarBloque(crudo) {
  return String(crudo ?? '')
    .replace(ADORNOS, ' ')
    .replace(/[*_]+/g, ' ')
    .split('\n')
    .map((renglon) => renglon.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// Cada pregunta, de la más específica a la más general. Se buscan al INICIO del
// bloque. Ninguna come lo que sigue de la pregunta: la respuesta puede venir en
// el mismo renglón sin dos puntos.
const CASA = '(?:domicilio|casa|hogar)';
const PARENTESCO_REF = '(?:amig[oa]|conocid[oa]|familiar)';
const PREGUNTAS_POR_CLAVE = [
  ['horario_domicilio', new RegExp(`horario\\s+para\\s+recibir\\s+(?:la\\s+)?visitas?\\s+(?:en|a)\\s+(?:su\\s+|tu\\s+)?${CASA}`, 'i')],
  ['horario_empleo', /horario\s+para\s+recibir\s+(?:en\s+)?(?:la\s+)?visitas?(?:\s+(?:en|a)\s+(?:su\s+|tu\s+)?(?:trabajo|empleo|oficina))?/i],
  ['empleo', /nombre\s+de\s+(?:su|tu)\s+(?:trabajo|empleo)/i],
  ['puesto', /puesto(?:\s+en\s+(?:su|tu)\s+(?:trabajo|empleo))?/i],
  ['direccion_empleo', /direcci[oó]n\s+de\s+(?:su|tu)\s+(?:trabajo|empleo)/i],
  ['antiguedad_laboral', /antig[uü]edad\s+laboral/i],
  [
    'companero',
    /nombre(?:\s*,\s*apellido\s+y|\s+y)\s+tel[eé]fono\s+de\s+alg[uú]n\s+compa[ñn]er[oa](?:\s+de\s+(?:su|tu)\s+(?:trabajo|empleo))?/i,
  ],
  ['antiguedad_domicilio', /tiempo\s+viviendo\s+en\s+(?:su|tu)\s+casa(?:\s+actual)?/i],
  [
    'referencia',
    new RegExp(
      `nombre(?:\\s*,\\s*apellido\\s+y|\\s+y)\\s+tel[eé]fono\\s+de\\s+alg[uú]n\\s+${PARENTESCO_REF}` +
        `(?:\\s*(?:,|\\so|\\sy)\\s*${PARENTESCO_REF})*`,
      'i',
    ),
  ],
  ['nss', /n[uú]mero\s+de\s+seguro\s+social(?:\s*\(\s*opcional\s*\))?/i],
  ['trabajo', /nombre\s+y\s+direcci[oó]n(?:\s+de\s+(?:su|tu)\s+trabajo)?/i],
  ['correo', /correo(?:\s+electr[oó]nico)?/i],
];

const PREGUNTAS_ANCLADAS = PREGUNTAS_POR_CLAVE.map(([clave, patron]) => [
  clave,
  new RegExp(`^\\s*(?:${patron.source})\\s*[:.\\-]?[ \\t]*`, 'i'),
]);

/** La pregunta con la que empieza un bloque y la respuesta que la sigue. */
function separarPregunta(bloque) {
  const limpio = limpiarBloque(bloque);
  for (const [clave, patron] of PREGUNTAS_ANCLADAS) {
    const encontrada = patron.exec(limpio);
    if (encontrada) return { clave, respuesta: limpio.slice(encontrada[0].length).replace(/^\s+/, '') };
  }
  return { clave: null, respuesta: limpio };
}

const ORDEN_NUEVO = [
  'correo',
  'empleo',
  'puesto',
  'direccion_empleo',
  'horario_empleo',
  'antiguedad_laboral',
  'companero',
  'antiguedad_domicilio',
  'horario_domicilio',
  'referencia',
];
const ORDEN_ANTERIOR = ['correo', 'trabajo', 'antiguedad_laboral', 'companero', 'antiguedad_domicilio', 'referencia', 'nss'];

// Preguntas que solo existen en el esqueleto nuevo: con una basta para saber cuál es.
const SOLO_NUEVO = new Set(['empleo', 'puesto', 'direccion_empleo', 'horario_empleo', 'horario_domicilio']);

export const NOMBRE_DE_CLAVE = {
  correo: 'correo',
  empleo: 'nombre del trabajo',
  puesto: 'puesto en el trabajo',
  direccion_empleo: 'dirección del trabajo',
  horario_empleo: 'horario para recibir visitas en el trabajo',
  antiguedad_laboral: 'antigüedad laboral',
  companero: 'compañero de trabajo',
  antiguedad_domicilio: 'tiempo viviendo en su casa',
  horario_domicilio: 'horario para recibir visita en el domicilio',
  referencia: 'referencia (amigo, conocido o familiar)',
  nss: 'número de seguro social',
  trabajo: 'nombre y dirección del trabajo',
};

/**
 * El formulario partido por pregunta.
 *
 * Devuelve `{ formato, puntos, respuestas, crudos }`:
 *   formato     'nuevo' (10 puntos), 'anterior' (7) o 'libre' (sin numerar)
 *   puntos      [{ numero, clave, respuesta }] en el orden del texto
 *   respuestas  { clave: respuesta sin la pregunta }
 *   crudos      { clave: bloque original }, para quitarlo del texto restante
 *
 * Un punto cuya pregunta no se reconoce se asigna por su posición en el
 * esqueleto que corresponda.
 */
export function respuestasDelFormulario(textoPegado) {
  const original = String(textoPegado ?? '');
  const crudosPorNumero = puntosDelFormulario(original);
  const numeros = Object.keys(crudosPorNumero).map(Number);
  if (numeros.length < 2) return { formato: 'libre', puntos: [], respuestas: {}, crudos: {} };

  const separados = numeros.map((numero) => ({ numero, ...separarPregunta(crudosPorNumero[numero]) }));
  const reconocidas = separados.map((punto) => punto.clave).filter(Boolean);

  const esNuevo =
    reconocidas.some((clave) => SOLO_NUEVO.has(clave)) ||
    (!reconocidas.some((clave) => clave === 'trabajo' || clave === 'nss') && numeros.length >= 8);
  const orden = esNuevo ? ORDEN_NUEVO : ORDEN_ANTERIOR;

  const puntos = [];
  const respuestas = {};
  const crudos = {};
  for (const punto of separados) {
    const clave = punto.clave ?? orden[punto.numero - 1];
    if (!clave) continue;
    puntos.push({ numero: punto.numero, clave, respuesta: punto.respuesta });
    // Si una clave se repite (dos «correo»), manda la primera.
    if (!(clave in respuestas)) {
      respuestas[clave] = punto.respuesta;
      crudos[clave] = crudosPorNumero[punto.numero];
    }
  }
  return { formato: esNuevo ? 'nuevo' : 'anterior', puntos, respuestas, crudos };
}

// La pregunta de cada punto del esqueleto anterior, para `respuestaDe`.
const PREGUNTAS = {
  1: /correo(?:\s+electr[oó]nico)?\s*:?/i,
  2: /nombre\s+y\s+direcci[oó]n(?:\s+de\s+(?:su|tu)\s+trabajo)?\s*:?/i,
  3: /antig[uü]edad\s+laboral\s*:?/i,
  4: /nombre\s+y\s+tel[eé]fono\s+de\s+alg[uú]n\s+compa[ñn]ero[^\n:]*:?/i,
  5: /tiempo\s+viviendo\s+en\s+su\s+casa(?:\s+actual)?\s*:?/i,
  6: /nombre\s+y\s+tel[eé]fono\s+de\s+alg[uú]n\s+amigo[^\n:]*:?/i,
  7: /n[uú]mero\s+de\s+seguro\s+social\s*(?:\(\s*opcional\s*\))?\s*:?/i,
};

/** La respuesta de un punto del esqueleto anterior, sin la pregunta ni el formato de WhatsApp. */
export function respuestaDe(puntos, numero) {
  return String(puntos[numero] ?? '')
    .replace(PREGUNTAS[numero] ?? /(?!)/, ' ')
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
  const { formato, puntos } = respuestasDelFormulario(original);
  if (formato === 'libre') return original;
  const separados = puntos
    .map(
      ({ numero, clave, respuesta }) =>
        `Punto ${numero} (${NOMBRE_DE_CLAVE[clave]}): ${respuesta.replace(/\n/g, ' · ') || '(sin respuesta)'}`,
    )
    .join('\n');
  return `${original}\n\n--- RESPUESTAS SEPARADAS POR PUNTO ---\n${separados}`;
}

// --- Respaldo: leer las personas directo del texto -------------------------------
//
// Gemini lee bien los formularios, pero si deja vacía una referencia o el
// compañero de trabajo, se buscan aquí en el texto pegado: cada teléfono de 10
// dígitos del punto, con el nombre que lo acompaña en el mismo renglón o en el
// de arriba.

// 10 dígitos con espacios, guiones o puntos en medio, y el +52 opcional.
const TELEFONO = /(?:\+?\s*52[\s.-]*)?\d(?:[\s.-]*\d){9}(?!\d)/g;
// La pregunta de la persona, que no es parte de la respuesta (si llegó completa).
const PREGUNTA = /nombre(?:\s*,\s*apellido\s+y|\s+y)\s+tel[eé]fono\s+de\s+alg[uú]n[^\n:]*:?/i;
// Parentescos y muletillas que no son parte del nombre. Los límites son \p{L}
// y no \b, porque \b no ve la «á» de «mamá» como letra.
const PARENTESCO =
  /(?<!\p{L})(mi|su|referencia|ref|compa[ñn]er[oa]|amig[oa]|herman[oa]|mam[aá]|pap[aá]|madre|padre|t[ií][oa]|prim[oa]|espos[oa]|cu[ñn]ad[oa]|vecin[oa]|abuel[oa]|hij[oa]|suegr[oa]|sobrin[oa]|novi[oa]|conocid[oa]|familiar)(?!\p{L})\s*:?/giu;

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
  const texto = limpiarBloque(bloque).replace(PREGUNTA, ' ');
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
 * trabajo, puesto, dirección, horarios, antigüedades, NSS y celular; el
 * compañero, la referencia y, si la pregunta de la referencia trae más de una
 * persona, las demás como referencias extra. Nunca pisa lo que Gemini sí leyó.
 */
export function respaldoDelTexto(lectura, textoPegado) {
  const original = String(textoPegado ?? '');
  const { formato, respuestas, crudos } = respuestasDelFormulario(original);
  const nueva = { ...(lectura ?? {}) };
  const llenar = (campo, valor) => {
    if (!texto(nueva[campo]) && texto(valor)) nueva[campo] = texto(valor);
  };
  const primera = (clave) => String(respuestas[clave] ?? '').split('\n')[0].trim();
  const junta = (clave) => String(respuestas[clave] ?? '').split('\n').join(' ').trim();

  // El correo se reconoce en cualquier parte, aunque no venga numerado.
  const correo = /[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(respuestas.correo || original);
  llenar('correo', correo?.[0].replace(/\s+/g, '').toLowerCase());

  if (formato === 'nuevo') {
    llenar('empleo', primera('empleo'));
    llenar('puesto', primera('puesto'));
    llenar('direccion_empleo', junta('direccion_empleo'));
    llenar('horario_empleo', junta('horario_empleo'));
    llenar('horario_domicilio', junta('horario_domicilio'));
  } else {
    // Esqueleto anterior: el primer renglón del punto 2, hasta la primera coma, es el negocio.
    llenar('empleo', primera('trabajo').split(/,|\s-\s/)[0]);
  }
  llenar('antiguedad_laboral', primera('antiguedad_laboral'));
  llenar('antiguedad_domicilio', primera('antiguedad_domicilio'));

  // NSS (esqueleto anterior): 11 dígitos, con o sin espacios o guiones.
  const nss = /\d(?:[\s-]*\d){10}(?!\d)/.exec(respuestas.nss ?? '');
  llenar('nss', nss?.[0].replace(/\D/g, ''));

  // Celular del cliente: un teléfono que venga después de «cel» o «celular»,
  // fuera de los puntos de las personas.
  const sinPersonas = [crudos.companero, crudos.referencia].reduce(
    (resto, bloque) => (bloque ? resto.replace(bloque, ' ') : resto),
    original,
  );
  const celular =
    /cel(?:ular)?\.?(?:\s+del\s+cliente)?\s*:?\s*((?:\+?\s*52[\s.-]*)?\d(?:[\s.-]*\d){9})(?!\d)/i.exec(
      sinPersonas,
    );
  llenar('celular', celular?.[1]);

  const [companero] = personasEn(respuestas.companero);
  if (companero) {
    if (!texto(nueva.companero_telefono)) nueva.companero_telefono = companero.telefono;
    if (!texto(nueva.companero_nombre) && companero.nombre) nueva.companero_nombre = companero.nombre;
  }

  const [primeraPersona, ...demas] = personasEn(respuestas.referencia);
  if (primeraPersona) {
    if (!texto(nueva.referencia_telefono)) nueva.referencia_telefono = primeraPersona.telefono;
    if (!texto(nueva.referencia_nombre) && primeraPersona.nombre) nueva.referencia_nombre = primeraPersona.nombre;
  }
  const yaHayExtra = Array.isArray(nueva.referencias_extra) && nueva.referencias_extra.length > 0;
  if (!yaHayExtra && demas.length > 0) nueva.referencias_extra = demas;

  return nueva;
}
