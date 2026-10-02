// Lleva lo que traen los documentos al formato exacto que aceptan los campos de
// Dinamo. Nada de esto sabe de Gemini ni del formulario: son funciones puras
// sobre texto, y por eso se prueban solas.

/**
 * Parte un teléfono en lada de 3 dígitos y número de 7.
 *
 * El formulario no admite otra división: `txtlada` tiene `maxlength=3` y
 * `txttelefono` `maxlength=7`. Para las ladas de dos dígitos (55, 81, 33) la
 * partición queda semánticamente rara — 55 1234 5678 se vuelve lada 551 y
 * número 2345678 — pero concatenados dan el número correcto, que es lo que
 * importa cuando alguien marca.
 *
 * Devuelve null si no hay exactamente 10 dígitos nacionales.
 */
export function partirTelefono(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '');

  // El +52 llega de WhatsApp; el número nacional son los 10 de la derecha.
  const nacional =
    digitos.length === 12 && digitos.startsWith('52') ? digitos.slice(2) : digitos;

  if (nacional.length !== 10) return null;

  return { lada: nacional.slice(0, 3), telefono: nacional.slice(3) };
}

/**
 * Separa una antigüedad escrita a mano en años y meses.
 *
 * El formulario los pide por separado (`txtant_anios_emp` y `cboant_meses_emp`),
 * y el cliente contesta cosas como «6 meses» o «6 años aprox».
 *
 * Devuelve null si el texto no menciona ninguna cantidad de tiempo.
 */
export function partirAntiguedad(texto) {
  const limpio = String(texto ?? '').toLowerCase();

  const anios = /(\d+)\s*a[ñn]os?/.exec(limpio);
  const meses = /(\d+)\s*mes(?:es)?/.exec(limpio);
  // «2 años y medio», «año y medio»: el medio año son 6 meses, y Dinamo tiene
  // campo de meses, así que se captura tal cual lo dijo el cliente.
  const yMedio = /a[ñn]os?\s+y\s+medio/.test(limpio) ? 6 : 0;

  if (anios || meses) {
    return {
      anios: anios ? Number(anios[1]) : 0,
      meses: meses ? Number(meses[1]) : yMedio,
    };
  }

  // «un año», «año y medio»: hay año pero sin cifra.
  if (/\ba[ñn]o\b/.test(limpio)) return { anios: 1, meses: yMedio };

  return null;
}

/**
 * Arma la razón social como la quiere el SAT: nombres y luego apellidos.
 *
 * La INE los imprime al revés (paterno, materno, nombres), así que este orden
 * no es cosmético: es el que espera `txtRazonSocial`.
 */
export function razonSocial(nombres, paterno, materno) {
  return [nombres, paterno, materno]
    .map((parte) => String(parte ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

// Solo se quitan las abreviaturas que estorban. «PRIVADA» no entra: en Saltillo
// hay calles que se llaman así de verdad (PRIVADA LOS OLIVOS), y recortarla
// dejaría un nombre que no existe.
const PREFIJO = /^(?:CALLE|C)\s+/i;

/**
 * Separa una línea de domicilio en calle, número exterior y número interior.
 *
 * La INE los imprime pegados («C JUAREZ 300 2» son calle, exterior 300
 * e interior 2) y los comprobantes meten sufijos que no son números de interior
 * («MORELOS 245 FRAC3»). La regla que distingue ambos casos: lo que sigue al
 * exterior solo es interior si es puramente numérico.
 */
export function partirCalle(texto) {
  const limpio = String(texto ?? '').trim().replace(/\s+/g, ' ');
  const sinPrefijo = limpio.replace(PREFIJO, '');
  const partes = sinPrefijo.split(' ');

  // Se busca desde la segunda palabra: hay calles que empiezan con número
  // («8 DE MAYO») y ese número es parte del nombre, no el exterior.
  let corte = -1;
  for (let i = 1; i < partes.length; i += 1) {
    if (/^\d+$/.test(partes[i])) {
      corte = i;
      break;
    }
  }

  if (corte === -1) {
    return { calle: sinPrefijo, numeroExterior: '', numeroInterior: '' };
  }

  const siguiente = partes[corte + 1];

  return {
    calle: partes.slice(0, corte).join(' '),
    numeroExterior: partes[corte],
    numeroInterior: siguiente && /^\d+$/.test(siguiente) ? siguiente : '',
  };
}
