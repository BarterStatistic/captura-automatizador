// Estados, municipios y direcciones: lo que se puede deducir sin adivinar.
//
// Tres fuentes de «estado», de la más a la menos confiable:
//
//   1. La CURP (posiciones 12 y 13): la clave de la entidad de NACIMIENTO, ya
//      resuelta por RENAPO. Sirve para `cboedo_nac` de Dinamo.
//   2. El texto del comprobante o de la dirección («Coah.», «Nuevo León»).
//   3. Las dos primeras cifras del código postal (SEPOMEX reparte los CP por
//      entidad en rangos fijos).
//
// El MUNICIPIO no se deduce de ninguna clave: del CP no se puede sacar sin el
// catálogo completo de SEPOMEX, y de la CURP no se puede sacar de ninguna forma.
// Aquí solo se limpia lo que el documento dice.

import { partirCalle } from './normaliza.js';

const sinAcentos = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '');

/** Mayúsculas, sin acentos ni puntuación, para comparar «N.L.» con «NL». */
export function clave(texto) {
  return sinAcentos(texto)
    .toUpperCase()
    .replace(/[.,;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// `dinamo` es el texto exacto de las opciones de `cboedo_nac` / `cboestado`.
// `nombres` son los nombres completos aceptados; `abreviaturas`, las siglas que
// se escriben en un recibo («COAH», «N.L.»). Las abreviaturas ya van en `clave`.
// `cp` es el rango de las dos primeras cifras del código postal.
export const ESTADOS = [
  { curp: 'AS', dinamo: 'AGUASCALIENTES', nombres: ['AGUASCALIENTES'], abreviaturas: ['AGS'], cp: [20, 20] },
  { curp: 'BC', dinamo: 'BAJA CALIFORNIA', nombres: ['BAJA CALIFORNIA'], abreviaturas: ['BC', 'B C'], cp: [21, 22] },
  { curp: 'BS', dinamo: 'BAJA CALIFORNIA SUR', nombres: ['BAJA CALIFORNIA SUR'], abreviaturas: ['BCS', 'B C S'], cp: [23, 23] },
  { curp: 'CC', dinamo: 'CAMPECHE', nombres: ['CAMPECHE'], abreviaturas: ['CAMP'], cp: [24, 24] },
  { curp: 'CL', dinamo: 'COAHUILA', nombres: ['COAHUILA', 'COAHUILA DE ZARAGOZA'], abreviaturas: ['COAH'], cp: [25, 27] },
  { curp: 'CM', dinamo: 'COLIMA', nombres: ['COLIMA'], abreviaturas: [], cp: [28, 28] },
  { curp: 'CS', dinamo: 'CHIAPAS', nombres: ['CHIAPAS'], abreviaturas: ['CHIS'], cp: [29, 30] },
  { curp: 'CH', dinamo: 'CHIHUAHUA', nombres: ['CHIHUAHUA'], abreviaturas: ['CHIH'], cp: [31, 33] },
  {
    curp: 'DF',
    dinamo: 'CIUDAD DE MEXICO',
    nombres: ['CIUDAD DE MEXICO', 'CD DE MEXICO', 'DISTRITO FEDERAL'],
    abreviaturas: ['CDMX', 'DF', 'D F'],
    cp: [1, 16],
  },
  { curp: 'DG', dinamo: 'DURANGO', nombres: ['DURANGO'], abreviaturas: ['DGO'], cp: [34, 35] },
  { curp: 'GT', dinamo: 'GUANAJUATO', nombres: ['GUANAJUATO'], abreviaturas: ['GTO'], cp: [36, 38] },
  { curp: 'GR', dinamo: 'GUERRERO', nombres: ['GUERRERO'], abreviaturas: ['GRO'], cp: [39, 41] },
  { curp: 'HG', dinamo: 'HIDALGO', nombres: ['HIDALGO'], abreviaturas: ['HGO'], cp: [42, 43] },
  { curp: 'JC', dinamo: 'JALISCO', nombres: ['JALISCO'], abreviaturas: ['JAL'], cp: [44, 49] },
  {
    curp: 'MC',
    dinamo: 'MEXICO',
    nombres: ['ESTADO DE MEXICO', 'EDO DE MEXICO', 'EDO MEXICO'],
    abreviaturas: ['EDOMEX', 'EDO MEX', 'MEX'],
    cp: [50, 57],
  },
  { curp: 'MN', dinamo: 'MICHOACAN', nombres: ['MICHOACAN', 'MICHOACAN DE OCAMPO'], abreviaturas: ['MICH'], cp: [58, 61] },
  { curp: 'MS', dinamo: 'MORELOS', nombres: ['MORELOS'], abreviaturas: ['MOR'], cp: [62, 62] },
  { curp: 'NT', dinamo: 'NAYARIT', nombres: ['NAYARIT'], abreviaturas: ['NAY'], cp: [63, 63] },
  { curp: 'NL', dinamo: 'NUEVO LEON', nombres: ['NUEVO LEON'], abreviaturas: ['NL', 'N L'], cp: [64, 67] },
  { curp: 'OC', dinamo: 'OAXACA', nombres: ['OAXACA'], abreviaturas: ['OAX'], cp: [68, 71] },
  { curp: 'PL', dinamo: 'PUEBLA', nombres: ['PUEBLA'], abreviaturas: ['PUE'], cp: [72, 75] },
  { curp: 'QT', dinamo: 'QUERETARO', nombres: ['QUERETARO', 'QUERETARO DE ARTEAGA'], abreviaturas: ['QRO'], cp: [76, 76] },
  { curp: 'QR', dinamo: 'QUINTANA ROO', nombres: ['QUINTANA ROO'], abreviaturas: ['Q ROO', 'QROO'], cp: [77, 77] },
  {
    curp: 'SP',
    dinamo: 'SAN LUIS POTOSI',
    nombres: ['SAN LUIS POTOSI'],
    abreviaturas: ['SLP', 'S L P'],
    cp: [78, 79],
  },
  { curp: 'SL', dinamo: 'SINALOA', nombres: ['SINALOA'], abreviaturas: ['SIN'], cp: [80, 82] },
  { curp: 'SR', dinamo: 'SONORA', nombres: ['SONORA'], abreviaturas: ['SON'], cp: [83, 85] },
  { curp: 'TC', dinamo: 'TABASCO', nombres: ['TABASCO'], abreviaturas: ['TAB'], cp: [86, 86] },
  { curp: 'TS', dinamo: 'TAMAULIPAS', nombres: ['TAMAULIPAS'], abreviaturas: ['TAMPS'], cp: [87, 89] },
  { curp: 'TL', dinamo: 'TLAXCALA', nombres: ['TLAXCALA'], abreviaturas: ['TLAX'], cp: [90, 90] },
  {
    curp: 'VZ',
    dinamo: 'VERACRUZ',
    nombres: ['VERACRUZ', 'VERACRUZ DE IGNACIO DE LA LLAVE'],
    abreviaturas: ['VER'],
    cp: [91, 96],
  },
  { curp: 'YN', dinamo: 'YUCATAN', nombres: ['YUCATAN'], abreviaturas: ['YUC'], cp: [97, 97] },
  { curp: 'ZS', dinamo: 'ZACATECAS', nombres: ['ZACATECAS'], abreviaturas: ['ZAC'], cp: [98, 99] },
];

/** Nacido en el extranjero: la CURP lo marca con NE y Dinamo no tiene opción. */
export const CLAVE_EXTRANJERO = 'NE';

export const CLAVES_ENTIDAD = new Set([...ESTADOS.map((e) => e.curp), CLAVE_EXTRANJERO]);

/** El estado por la clave de dos letras de la CURP (posiciones 12-13), o null. */
export function estadoPorClaveCurp(claveDeDos) {
  return ESTADOS.find((estado) => estado.curp === String(claveDeDos ?? '').toUpperCase()) ?? null;
}

/** El estado de nacimiento de una CURP de 18 caracteres. */
export function estadoPorCurp(curp) {
  return estadoPorClaveCurp(String(curp ?? '').slice(11, 13));
}

/** El estado al que pertenece un código postal de 5 dígitos, o null. */
export function estadoPorCp(cp) {
  const limpio = String(cp ?? '').replace(/\D/g, '');
  if (limpio.length !== 5) return null;
  const prefijo = Number(limpio.slice(0, 2));
  return ESTADOS.find((estado) => prefijo >= estado.cp[0] && prefijo <= estado.cp[1]) ?? null;
}

/** El estado cuyo nombre completo o sigla es exactamente `texto`. */
export function estadoPorTexto(texto) {
  const buscado = clave(texto);
  if (!buscado) return null;
  return (
    ESTADOS.find((estado) => estado.nombres.includes(buscado) || estado.abreviaturas.includes(buscado)) ?? null
  );
}

/**
 * Separa el estado que viene pegado a otro texto: «SALTILLO, COAH.», «SALTILLO
 * COAH», «MONTERREY NL». Devuelve lo que queda y el estado, o el texto intacto.
 *
 * Una cola sin coma solo cuenta si es una SIGLA: «VILLA GUERRERO» es un
 * municipio, no «VILLA» en el estado de Guerrero.
 */
export function separarEstado(texto) {
  const original = String(texto ?? '').trim();
  if (!original) return { resto: '', estado: null };

  const entero = estadoPorTexto(original);
  if (entero) return { resto: '', estado: entero };

  const partes = original.split(/\s*[,;]\s*|\s+-\s+/).filter(Boolean);
  if (partes.length > 1) {
    const ultimo = estadoPorTexto(partes.at(-1));
    if (ultimo) return { resto: partes.slice(0, -1).join(', '), estado: ultimo };
  }

  const palabras = clave(original).split(' ');
  for (const cuantas of [3, 2, 1]) {
    if (palabras.length <= cuantas) continue;
    const cola = palabras.slice(-cuantas).join(' ');
    const estado = ESTADOS.find((e) => e.abreviaturas.includes(cola));
    if (estado) {
      // Se recorta del texto original, no del normalizado, para conservar la Ñ.
      const tokens = original.replace(/[.,;]/g, ' ').split(/\s+/).filter(Boolean);
      return { resto: tokens.slice(0, -cuantas).join(' '), estado };
    }
  }
  return { resto: original, estado: null };
}

// --- Municipios de Coahuila ---------------------------------------------------------
//
// Es el catálogo que Dinamo muestra en `cboMpio_nac` cuando el estado de
// nacimiento es Coahuila (38 municipios, copiados del HTML real). De otros
// estados no se conoce la lista: ahí se escribe a mano.

export const MUNICIPIOS_COAHUILA = [
  'ABASOLO', 'ACUÑA', 'ALLENDE', 'ARTEAGA', 'CANDELA', 'CASTAÑOS', 'CUATRO CIENEGAS', 'ESCOBEDO',
  'FRANCISCO I. MADERO', 'FRONTERA', 'GENERAL CEPEDA', 'GUERRERO', 'HIDALGO', 'JIMENEZ', 'JUAREZ',
  'LAMADRID', 'MATAMOROS', 'MONCLOVA', 'MORELOS', 'MUZQUIZ', 'NADADORES', 'NAVA', 'OCAMPO', 'PARRAS',
  'PIEDRAS NEGRAS', 'PROGRESO', 'RAMOS ARIZPE', 'SABINAS', 'SACRAMENTO', 'SALTILLO', 'SAN BUENAVENTURA',
  'SAN JUAN DE SABINAS', 'SAN PEDRO', 'SIERRA MOJADA', 'TORREON', 'VIESCA', 'VILLA UNION', 'ZARAGOZA',
];

// Cómo se escribe a mano lo que el catálogo llama de otra forma.
const ALIAS_MUNICIPIO = {
  'CD ACUNA': 'ACUÑA',
  'CIUDAD ACUNA': 'ACUÑA',
  'PARRAS DE LA FUENTE': 'PARRAS',
  'FCO I MADERO': 'FRANCISCO I. MADERO',
  'FRANCISCO I MADERO': 'FRANCISCO I. MADERO',
  'GRAL CEPEDA': 'GENERAL CEPEDA',
  'CUATRO CIENEGAS DE CARRANZA': 'CUATRO CIENEGAS',
};

const PREFIJO_MUNICIPIO = /^(?:municipio|mpio|delegaci[oó]n|alcald[ií]a)\.?\s+(?:de\s+)?/i;

/**
 * Limpia el municipio como lo imprime un recibo y le quita el estado pegado.
 * «MUNICIPIO DE SALTILLO, COAH.» → { municipio: 'SALTILLO', estado: Coahuila }.
 */
export function limpiarMunicipio(texto) {
  const sinPrefijo = String(texto ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(PREFIJO_MUNICIPIO, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sinPrefijo) return { municipio: '', estado: null };

  const { resto, estado } = separarEstado(sinPrefijo);
  const municipio = (estado ? resto : sinPrefijo).replace(/[.,;\s]+$/, '').trim();
  return { municipio: municipio.toUpperCase(), estado };
}

/** El municipio de Coahuila del catálogo de Dinamo que corresponde al texto, o ''. */
export function municipioDeCoahuila(texto) {
  const buscado = clave(limpiarMunicipio(texto).municipio);
  if (!buscado) return '';
  const alias = ALIAS_MUNICIPIO[buscado];
  if (alias) return alias;
  return MUNICIPIOS_COAHUILA.find((municipio) => clave(municipio) === buscado) ?? '';
}

// --- Direcciones --------------------------------------------------------------------

// «Cerca de», «a un lado de», «por»…: dicen dónde queda, no cómo se llama la calle.
const ANTES_DE_LA_CALLE =
  /^(?:est[aá]\s+)?(?:cerca|junto|enfrente|frente|a\s+un\s+lado|a\s+lado|por|sobre|esquina)(?:\s+con)?(?:\s+(?:de|del|a|al))?\s+(?:la\s+|el\s+)?/i;

const PARECE_COLONIA = /^(?:col(?:onia)?|fracc(?:ionamiento)?|barrio|zona|parque|ejido|ampliaci[oó]n|residencial|priv(?:ada)?|unidad|conjunto)\b/i;
const PREFIJO_COLONIA = /^(?:col(?:onia)?|fracc(?:ionamiento)?)\.?\s+/i;

const VACIA = Object.freeze({
  calle: '',
  numeroExterior: '',
  numeroInterior: '',
  colonia: '',
  cp: '',
  municipio: '',
  estado: null,
  referencia: false,
});

/**
 * Parte una dirección escrita de corrido en calle, número, colonia, CP,
 * municipio y estado:
 *
 *   «Cerca de Av. Las Industrias, Parque Industrial Norte, 25114 Saltillo, Coah.»
 *     → calle «Av. Las Industrias», colonia «Parque Industrial Norte»,
 *       CP 25114, municipio SALTILLO, estado Coahuila.
 *
 * No inventa: lo que no se distingue queda vacío. El estado sale del texto y,
 * si no lo trae, de las dos primeras cifras del CP.
 */
export function analizarDireccion(texto) {
  const todo = String(texto ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    // «Blvd. Rodríguez 2000 Col. Centro»: la colonia empieza donde dice «Col.».
    .replace(/\s+(?=(?:col(?:onia)?|fracc(?:ionamiento)?)\.?\s)/gi, ', ')
    .replace(/[.,;\s]+$/, '');
  if (!todo) return { ...VACIA };

  const cp = /(?<!\d)(\d{5})(?!\d)/.exec(todo)?.[1] ?? '';
  const segmentos = todo
    .split(/\s*[,;]\s*/)
    .map((parte) => ({ texto: parte.trim(), conCp: false }))
    .filter((segmento) => segmento.texto);

  if (cp) {
    const donde = segmentos.find((segmento) => segmento.texto.includes(cp));
    if (donde) {
      donde.texto = donde.texto
        .replace(cp, ' ')
        .replace(/\bC\.?\s?P\.?(?=\s|$)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      donde.conCp = true;
    }
  }

  const lista = segmentos.filter((segmento) => segmento.texto);

  let estado = null;
  const ultimo = lista.at(-1);
  if (ultimo) {
    const separado = separarEstado(ultimo.texto);
    if (separado.estado) {
      estado = separado.estado;
      if (separado.resto) ultimo.texto = separado.resto;
      else lista.pop();
    }
  }

  let municipio = '';
  const conCp = lista.findIndex((segmento) => segmento.conCp);
  if (conCp > 0) {
    municipio = lista[conCp].texto;
    lista.splice(conCp, 1);
  } else if ((cp || estado) && lista.length >= 2) {
    municipio = lista.pop().texto;
  }

  const segmentoCalle = lista[0]?.texto ?? '';
  const otros = lista.slice(1);
  const segmentoColonia = (otros.find((segmento) => PARECE_COLONIA.test(segmento.texto)) ?? otros[0])?.texto ?? '';

  const referencia = ANTES_DE_LA_CALLE.test(segmentoCalle);
  let calle = segmentoCalle.replace(ANTES_DE_LA_CALLE, '').trim();

  let numeroExterior = '';
  let numeroInterior = '';
  const explicito = /(?:#|\bn[uú]m(?:ero)?\.?|\bno\.?)\s*(\d+[A-Za-z]?)/i.exec(calle);
  if (explicito) {
    numeroExterior = explicito[1];
    calle = calle
      .replace(explicito[0], ' ')
      .replace(/\s+/g, ' ')
      .replace(/^(?:calle|c)\.?\s+/i, '')
      .trim();
  } else {
    const partida = partirCalle(calle);
    calle = partida.calle;
    numeroExterior = partida.numeroExterior;
    numeroInterior = partida.numeroInterior;
  }

  return {
    calle,
    numeroExterior,
    numeroInterior,
    colonia: segmentoColonia.replace(PREFIJO_COLONIA, '').trim(),
    cp,
    municipio: municipio.toUpperCase(),
    estado: estado ?? estadoPorCp(cp),
    referencia,
  };
}

/**
 * El estado de un domicilio con su origen, y un aviso si el texto y el CP no
 * coinciden (uno de los dos se leyó mal). El texto gana: lo escribió el
 * documento; el CP solo lo respalda.
 */
export function resolverEstado({ texto, cp, municipio } = {}) {
  const separado = separarEstado(texto);
  const delTexto = separado.estado ?? estadoPorTexto(texto);
  const desdeMunicipio = limpiarMunicipio(municipio).estado;
  const delCp = estadoPorCp(cp);

  const elegido = delTexto ?? desdeMunicipio ?? delCp;
  const origen = delTexto ? 'texto' : desdeMunicipio ? 'municipio' : delCp ? 'cp' : '';

  let aviso = '';
  if (elegido && delCp && elegido.curp !== delCp.curp) {
    aviso =
      `El estado dice ${elegido.dinamo}, pero el código postal ${String(cp).trim()} es de ` +
      `${delCp.dinamo}. Revisa cuál se leyó mal.`;
  }
  return { estado: elegido, origen, aviso };
}
