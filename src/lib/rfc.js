// Cálculo del RFC de persona física (13 posiciones).
//
// Port 1:1 de `ine-refacil/rfc.py`. Los nombres de función y las tablas se
// conservan para que cualquier divergencia futura se pueda auditar línea por
// línea contra el original; `scripts/paridad-buro.mjs` corre los mismos casos
// que `ine-refacil/tests/test_rfc.py`.
//
// Dos caminos para las 10 primeras posiciones:
//
// 1. Desde la CURP — las 10 primeras posiciones del RFC de una persona física
//    son idénticas a las 10 primeras de su CURP. Es la fuente más confiable
//    porque ya viene resuelta por RENAPO.
// 2. Desde nombre + fecha de nacimiento, aplicando las reglas del instructivo
//    del SAT. Se usa cuando la CURP no se pudo leer de la INE, y como
//    verificación cruzada cuando sí se leyó.
//
// La homoclave (posiciones 11-12) y el dígito verificador (posición 13) siempre
// se calculan con el algoritmo del SAT sobre el nombre completo.
//
// ADVERTENCIA: la homoclave calculada no está validada ante el SAT. El
// algoritmo es el publicado, pero el SAT puede tener asignada otra homoclave a
// un contribuyente ya registrado.

// --- Tablas del instructivo del SAT ------------------------------------------

const VOCALES = 'AEIOU';

// Marcador temporal que protege la Ñ de la descomposición NFD (ver `normalizar`).
const MARCA_ENIE = String.fromCharCode(1);

// Partículas que se ignoran al tomar las iniciales de apellidos y nombres.
export const PARTICULAS = new Set([
  'DA', 'DAS', 'DE', 'DEL', 'DER', 'DI', 'DIE', 'DD', 'EL', 'LA', 'LAS',
  'LE', 'LES', 'LO', 'LOS', 'MAC', 'MC', 'VAN', 'VON', 'Y',
]);

// Nombres que se omiten cuando la persona tiene más de un nombre de pila.
export const NOMBRES_OMITIDOS = new Set(['MARIA', 'MA', 'MA.', 'JOSE', 'J', 'J.']);

// Combinaciones malsonantes: la última letra se sustituye por X.
export const PALABRAS_INCONVENIENTES = new Set([
  'BACA', 'BAKA', 'BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA',
  'CAKO', 'COGE', 'COGI', 'COJA', 'COJE', 'COJI', 'COJO', 'COLA', 'CULO',
  'FALO', 'FETO', 'GETA', 'GUEI', 'GUEY', 'JETA', 'JOTO', 'KACA', 'KACO',
  'KAGA', 'KAGO', 'KAKA', 'KAKO', 'KOGE', 'KOGI', 'KOJA', 'KOJE', 'KOJI',
  'KOJO', 'KOLA', 'KULO', 'LILO', 'LOCA', 'LOCO', 'LOKA', 'LOKO', 'MAME',
  'MAMO', 'MEAR', 'MEAS', 'MEON', 'MIAR', 'MION', 'MOCO', 'MOKO', 'MULA',
  'MULO', 'NACA', 'NACO', 'PEDA', 'PEDO', 'PENE', 'PIPI', 'PITO', 'POPO',
  'PUTA', 'PUTO', 'QULO', 'RATA', 'ROBA', 'ROBE', 'ROBO', 'RUIN', 'SENO',
  'TETA', 'VACA', 'VAGA', 'VAGO', 'VAKA', 'VUEI', 'VUEY', 'WUEI', 'WUEY',
]);

// Valor de dos dígitos por carácter, para el cálculo de la homoclave.
const VALORES_HOMOCLAVE = {
  ' ': '00', 0: '00', 1: '01', 2: '02', 3: '03', 4: '04',
  5: '05', 6: '06', 7: '07', 8: '08', 9: '09', '&': '10',
  A: '11', B: '12', C: '13', D: '14', E: '15', F: '16',
  G: '17', H: '18', I: '19', J: '21', K: '22', L: '23',
  M: '24', N: '25', O: '26', P: '27', Q: '28', R: '29',
  S: '32', T: '33', U: '34', V: '35', W: '36', X: '37',
  Y: '38', Z: '39', 'Ñ': '40',
};

// Alfabeto de 34 símbolos con el que se expresa la homoclave (sin 0, O ni Ñ).
export const ALFABETO_HOMOCLAVE = '123456789ABCDEFGHIJKLMNPQRSTUVWXYZ';

// Valor por carácter para el dígito verificador.
const VALORES_VERIFICADOR = {
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8,
  9: 9, A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16,
  H: 17, I: 18, J: 19, K: 20, L: 21, M: 22, N: 23, '&': 24,
  O: 25, P: 26, Q: 27, R: 28, S: 29, T: 30, U: 31, V: 32,
  W: 33, X: 34, Y: 35, Z: 36, ' ': 37, 'Ñ': 38,
};

// Formato de CURP: 4 letras (la 2ª vocal o X), 6 dígitos de fecha, sexo,
// 5 consonantes de entidad/nombre, homónimo y dígito verificador.
const FORMATO_CURP = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/;

// --- Normalización ------------------------------------------------------------

/**
 * Mayúsculas, sin acentos y sin caracteres ajenos al alfabeto del RFC.
 *
 * La Ñ se conserva en esta etapa porque la homoclave sí la puntúa; su
 * sustitución por X ocurre solo en las cuatro letras iniciales. Se protege con
 * un marcador antes de descomponer en NFD, porque si no la Ñ se separaría en
 * N + tilde y la tilde caería con el resto de los acentos.
 */
export function normalizar(texto) {
  if (!texto) return '';
  let t = String(texto).toUpperCase().split('Ñ').join(MARCA_ENIE);
  t = t.normalize('NFD').replace(/\p{Mn}/gu, '');
  t = t.split(MARCA_ENIE).join('Ñ');
  t = t.replace(/[^A-ZÑ&. ]/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * Deja la CURP en mayúsculas y solo con letras y dígitos.
 *
 * No reutiliza `normalizar` porque aquélla descarta los dígitos, que en una
 * CURP son la mitad del dato.
 */
export function normalizarCurp(curp) {
  if (!curp) return '';
  const t = String(curp).toUpperCase().normalize('NFD').replace(/\p{Mn}/gu, '');
  return t.replace(/[^A-Z0-9]/g, '');
}

/** Palabras de un texto ya normalizado, sin cadenas vacías. */
function palabras(texto) {
  return texto.split(' ').filter(Boolean);
}

/** Descarta artículos y preposiciones, sin dejar la lista vacía. */
function quitarParticulas(lista) {
  const filtradas = lista.filter((p) => !PARTICULAS.has(p));
  return filtradas.length ? filtradas : lista;
}

/** Devuelve el apellido normalizado y sin partículas, como una sola palabra. */
export function limpiarApellido(apellido) {
  return quitarParticulas(palabras(normalizar(apellido))).join('');
}

/** Primer nombre de pila útil, omitiendo JOSE/MARIA cuando hay otro. */
export function primerNombre(nombres) {
  const lista = quitarParticulas(palabras(normalizar(nombres)));
  if (!lista.length) return '';
  if (lista.length > 1 && NOMBRES_OMITIDOS.has(lista[0])) return lista[1];
  return lista[0];
}

/** Primera vocal después de la letra inicial; X si la palabra no tiene. */
export function primeraVocalInterna(palabra) {
  for (const letra of palabra.slice(1)) {
    if (VOCALES.includes(letra)) return letra;
  }
  return 'X';
}

function sinEnie(texto) {
  return texto.replace(/Ñ/g, 'X');
}

// --- Las cuatro letras iniciales ---------------------------------------------

/** Cuatro letras iniciales del RFC según las reglas del SAT. */
export function letrasIniciales(nombres, paterno, materno) {
  const pat = limpiarApellido(paterno);
  const mat = limpiarApellido(materno);
  const nom = primerNombre(nombres);

  if (!nom) throw new Error('Se requiere al menos un nombre de pila');
  if (!pat && !mat) throw new Error('Se requiere al menos un apellido');

  let letras;
  if (!pat) {
    // Sin apellido paterno: dos letras del materno y dos del nombre.
    letras = (mat.slice(0, 2) + nom.slice(0, 2).padEnd(2, 'X')).slice(0, 4);
  } else if (!mat) {
    // Sin apellido materno: dos letras del paterno y dos del nombre.
    letras = (pat.slice(0, 2).padEnd(2, 'X') + nom.slice(0, 2).padEnd(2, 'X')).slice(0, 4);
  } else if (pat.length <= 2) {
    // Apellido paterno de una o dos letras: una de cada apellido, dos del nombre.
    letras = pat[0] + mat[0] + nom.slice(0, 2).padEnd(2, 'X');
  } else {
    letras = pat[0] + primeraVocalInterna(pat) + mat[0] + nom[0];
  }

  letras = sinEnie(letras.padEnd(4, 'X').slice(0, 4));
  if (PALABRAS_INCONVENIENTES.has(letras)) letras = `${letras.slice(0, 3)}X`;
  return letras;
}

/** Convierte 'AAAA-MM-DD' (o 'DD/MM/AAAA') en 'AAMMDD'. */
export function fechaAammdd(fechaNacimiento) {
  const texto = String(fechaNacimiento ?? '').trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (iso) {
    const [, anio, mes, dia] = iso;
    return anio.slice(2) + mes + dia;
  }

  const barras = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (barras) {
    const [, dia, mes, anio] = barras;
    return anio.slice(2) + mes + dia;
  }

  throw new Error(`Fecha de nacimiento no reconocida: ${JSON.stringify(fechaNacimiento)}`);
}

// --- Homoclave y dígito verificador ------------------------------------------

/** Homoclave de dos caracteres, calculada sobre el nombre completo. */
export function calcularHomoclave(nombres, paterno, materno) {
  const completo = [normalizar(paterno), normalizar(materno), normalizar(nombres)]
    .filter(Boolean)
    .join(' ');

  // El instructivo puntúa el nombre tal cual, incluidas partículas y espacios.
  let digitos = '0';
  for (const c of completo) digitos += VALORES_HOMOCLAVE[c] ?? '00';

  let suma = 0;
  for (let i = 0; i < digitos.length - 1; i += 1) {
    suma += Number(digitos.slice(i, i + 2)) * Number(digitos[i + 1]);
  }

  const residuo = suma % 1000;
  return ALFABETO_HOMOCLAVE[Math.floor(residuo / 34)] + ALFABETO_HOMOCLAVE[residuo % 34];
}

/** Último carácter del RFC, a partir de sus 12 posiciones previas. */
export function calcularDigitoVerificador(rfc12) {
  if (rfc12.length !== 12) {
    throw new Error('El dígito verificador se calcula sobre 12 caracteres');
  }

  let suma = 0;
  for (let i = 0; i < rfc12.length; i += 1) {
    suma += (VALORES_VERIFICADOR[rfc12[i]] ?? 0) * (13 - i);
  }

  const residuo = suma % 11;
  if (residuo === 0) return '0';
  if (residuo === 1) return 'A';
  return String(11 - residuo);
}

// --- Entradas públicas --------------------------------------------------------

/** RFC de 13 posiciones tomando las 10 primeras de la CURP. */
export function rfcDesdeCurp(curp, nombres, paterno, materno) {
  const limpia = normalizarCurp(curp);
  if (!FORMATO_CURP.test(limpia)) {
    throw new Error(`CURP con formato inválido: ${JSON.stringify(limpia)}`);
  }
  const rfc12 = limpia.slice(0, 10) + calcularHomoclave(nombres, paterno, materno);
  return rfc12 + calcularDigitoVerificador(rfc12);
}

/** RFC de 13 posiciones calculado desde el nombre y la fecha de nacimiento. */
export function rfcDesdeNombre(nombres, paterno, materno, fechaNacimiento) {
  const base = letrasIniciales(nombres, paterno, materno) + fechaAammdd(fechaNacimiento);
  const rfc12 = base + calcularHomoclave(nombres, paterno, materno);
  return rfc12 + calcularDigitoVerificador(rfc12);
}

/** Verifica formato y dígito verificador de la CURP. */
export function curpValida(curp) {
  const limpia = normalizarCurp(curp);
  if (!FORMATO_CURP.test(limpia)) return false;

  const alfabeto = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
  let suma = 0;
  for (let i = 0; i < 17; i += 1) suma += alfabeto.indexOf(limpia[i]) * (18 - i);
  const esperado = (10 - (suma % 10)) % 10;
  return Number(limpia[17]) === esperado;
}

/**
 * Determina el RFC y reporta discrepancias entre ambos caminos de cálculo.
 *
 * Devuelve { rfc, origen, advertencia }. La CURP gana cuando ambos difieren,
 * porque sus 10 primeras posiciones ya vienen resueltas por RENAPO.
 */
export function resolverRfc(nombres, paterno, materno, fechaNacimiento, curp = null) {
  let porNombre = null;
  let errorNombre = null;
  try {
    porNombre = rfcDesdeNombre(nombres, paterno, materno, fechaNacimiento);
  } catch (exc) {
    errorNombre = exc.message;
  }

  if (curp) {
    let porCurp;
    try {
      porCurp = rfcDesdeCurp(curp, nombres, paterno, materno);
    } catch (exc) {
      if (porNombre) {
        return {
          rfc: porNombre,
          origen: 'nombre',
          advertencia: `La CURP no es utilizable (${exc.message}); se usó el cálculo por nombre.`,
        };
      }
      throw exc;
    }

    if (porNombre && porNombre.slice(0, 10) !== porCurp.slice(0, 10)) {
      return {
        rfc: porCurp,
        origen: 'curp',
        advertencia:
          `El RFC calculado por nombre (${porNombre.slice(0, 10)}) no coincide con el ` +
          `derivado de la CURP (${porCurp.slice(0, 10)}). Se usó el de la CURP; verifica ` +
          'que el nombre y la fecha de nacimiento se hayan leído bien.',
      };
    }

    return { rfc: porCurp, origen: 'curp', advertencia: null };
  }

  if (porNombre) {
    return {
      rfc: porNombre,
      origen: 'nombre',
      advertencia: 'No se leyó la CURP; el RFC se calculó solo con el nombre y la fecha.',
    };
  }

  throw new Error(errorNombre || 'Datos insuficientes para calcular el RFC');
}
