// La CURP: validarla, corregirla cuando la lectura de la INE falló, y cotejarla
// con el resto de lo leído.
//
// Gemini lee la CURP de una foto, y las fotos fallan siempre igual: confunden
// O con 0, I con 1, B con 8, S con 5, Z con 2, G con 6. Una letra mal leída
// rompe el dígito verificador, el RFC (que usa las 10 primeras posiciones) y el
// estado de nacimiento (posiciones 12-13). Antes se aceptaba tal cual.
//
// Anatomía de la CURP (18 posiciones):
//
//    1-4   iniciales: 1ª letra del paterno, 1ª vocal interna del paterno, 1ª
//          letra del materno, 1ª letra del nombre
//    5-10  fecha de nacimiento AAMMDD
//    11    sexo H / M
//    12-13 entidad de nacimiento (AS, BC, … CL, … NE)
//    14-16 1ª consonante interna del paterno, del materno y del nombre
//    17    homoclave: dígito si nació antes de 2000, letra desde 2000
//    18    dígito verificador
//
// De los datos que ya se leyeron (nombre, fecha, sexo) se calculan las posiciones
// 1-11 y 14-16; con eso una CURP mal leída se puede corregir con confianza, y
// una bien leída se puede comprobar. NUNCA se inventa una CURP: si no hay una
// sola corrección que cuadre con todo, se deja lo leído y se avisa.

import {
  PALABRAS_INCONVENIENTES,
  curpValida,
  limpiarApellido,
  normalizarCurp,
  primerNombre,
  primeraVocalInterna,
} from './rfc.js';
import { CLAVES_ENTIDAD, estadoPorCurp } from './geografia.js';

const VOCALES = 'AEIOU';
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITOS = '0123456789';

// Alfabeto del dígito verificador (con la Ñ en su lugar, que desplaza de la O a la Z).
const ALFABETO_VERIFICADOR = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

// Lo que cada posición (índice desde 0) admite: letra, dígito o cualquiera.
function tipoDePosicion(i) {
  if (i <= 3 || i === 10 || (i >= 11 && i <= 15)) return 'L';
  if ((i >= 4 && i <= 9) || i === 17) return 'D';
  return 'A'; // la 17 (índice 16): dígito o letra según el siglo
}

// Confusiones típicas de una foto.
const LETRA_A_DIGITO = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' };
const DIGITO_A_LETRA = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' };

/** Dígito verificador que le toca a las primeras 17 posiciones. */
export function digitoVerificador(primeras17) {
  let suma = 0;
  for (let i = 0; i < 17; i += 1) suma += ALFABETO_VERIFICADOR.indexOf(primeras17[i]) * (18 - i);
  return String((10 - (suma % 10)) % 10);
}

/** Fecha AAAA-MM-DD de una CURP, o null si la fecha no existe. */
export function fechaDeCurp(curp) {
  const limpia = normalizarCurp(curp);
  const partes = /^[A-Z]{4}(\d{2})(\d{2})(\d{2})/.exec(limpia);
  if (!partes) return null;
  // El 17.º carácter es dígito para nacidos antes de 2000 y letra desde 2000.
  const siglo = /\d/.test(limpia.charAt(16)) ? 1900 : 2000;
  const anio = siglo + Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const fecha = new Date(anio, mes - 1, dia);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** H o M, tal como está en la posición 11 de la CURP. */
export function sexoDeCurp(curp) {
  const letra = normalizarCurp(curp).charAt(10);
  return letra === 'H' || letra === 'M' ? letra : '';
}

function sinEnie(texto) {
  return texto.replace(/Ñ/g, 'X');
}

function consonanteInterna(palabra) {
  for (const letra of palabra.slice(1)) {
    if (/[A-ZÑ]/.test(letra) && !VOCALES.includes(letra)) return sinEnie(letra);
  }
  return 'X';
}

/** H o M a partir de lo que diga la INE («H», «M», «HOMBRE», «MUJER»). */
function sexoLetra(sexo) {
  const texto = String(sexo ?? '').trim().toUpperCase();
  if (texto === 'H' || texto.startsWith('HOMB') || texto.startsWith('MASC')) return 'H';
  if (texto === 'M' || texto.startsWith('MUJ') || texto.startsWith('FEM')) return 'M';
  return '';
}

/**
 * Las posiciones de la CURP que se pueden calcular con lo leído: un arreglo de
 * 18 con la letra esperada o null donde no se sabe.
 */
export function posicionesEsperadas({ nombres, paterno, materno, fechaNacimiento, sexo } = {}) {
  const esperado = Array(18).fill(null);

  const pat = limpiarApellido(paterno);
  const mat = limpiarApellido(materno);
  const nom = primerNombre(nombres);

  if (pat && nom) {
    let iniciales = [
      sinEnie(pat[0]),
      sinEnie(primeraVocalInterna(pat)),
      sinEnie(mat ? mat[0] : 'X'),
      sinEnie(nom[0]),
    ];
    // Palabra inconveniente: en la CURP se cambia la SEGUNDA letra por X.
    if (PALABRAS_INCONVENIENTES.has(iniciales.join(''))) iniciales[1] = 'X';
    iniciales.forEach((letra, i) => {
      esperado[i] = letra;
    });
    esperado[13] = consonanteInterna(pat);
    esperado[14] = mat ? consonanteInterna(mat) : 'X';
    esperado[15] = consonanteInterna(nom);
  }

  const fecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaNacimiento ?? '').trim());
  if (fecha) {
    `${fecha[1].slice(2)}${fecha[2]}${fecha[3]}`.split('').forEach((cifra, i) => {
      esperado[4 + i] = cifra;
    });
  }

  const letraSexo = sexoLetra(sexo);
  if (letraSexo) esperado[10] = letraSexo;

  return esperado;
}

/** Posiciones (desde 1) donde la CURP no coincide con lo esperado, con su letra. */
function diferencias(curp, esperado) {
  const faltas = [];
  esperado.forEach((letra, i) => {
    if (letra !== null && curp[i] !== letra) faltas.push({ posicion: i + 1, tiene: curp[i], esperaba: letra });
  });
  return faltas;
}

const NOMBRE_POSICION = (posicion) => {
  if (posicion <= 4) return 'las iniciales del nombre';
  if (posicion <= 10) return 'la fecha de nacimiento';
  if (posicion === 11) return 'el sexo';
  if (posicion >= 14 && posicion <= 16) return 'las consonantes internas del nombre';
  return `la posición ${posicion}`;
};

/** ¿Es una CURP posible? Formato, dígito verificador, fecha real y entidad conocida. */
function esPosible(curp) {
  return curp.length === 18 && curpValida(curp) && fechaDeCurp(curp) !== null && CLAVES_ENTIDAD.has(curp.slice(11, 13));
}

/** Aplica las confusiones típicas según lo que cada posición admite. */
function sinConfusiones(curp) {
  return curp
    .split('')
    .map((letra, i) => {
      const tipo = tipoDePosicion(i);
      if (tipo === 'D' && /[A-Z]/.test(letra) && LETRA_A_DIGITO[letra]) return LETRA_A_DIGITO[letra];
      if (tipo === 'L' && /\d/.test(letra) && DIGITO_A_LETRA[letra]) return DIGITO_A_LETRA[letra];
      return letra;
    })
    .join('');
}

function cambiosEntre(antes, despues) {
  const cambios = [];
  for (let i = 0; i < Math.max(antes.length, despues.length); i += 1) {
    if (antes[i] !== despues[i]) cambios.push({ posicion: i + 1, de: antes[i] ?? '', a: despues[i] ?? '' });
  }
  return cambios;
}

/** Las 17 o 19 letras se vuelven 18 quitando o agregando un carácter. */
function basesDeLargo18(curp) {
  if (curp.length === 18) return [curp];
  const bases = [];
  if (curp.length === 19) {
    for (let i = 0; i < 19; i += 1) bases.push(curp.slice(0, i) + curp.slice(i + 1));
  } else if (curp.length === 17) {
    for (let i = 0; i <= 17; i += 1) {
      for (const letra of LETRAS + DIGITOS) bases.push(curp.slice(0, i) + letra + curp.slice(i));
    }
  }
  return bases;
}

/**
 * Busca la corrección de una CURP que no pasa la verificación.
 *
 * Ordena los intentos de menos a más cambios: confusiones de foto, un solo
 * carácter distinto, y un carácter de más o de menos. Una corrección solo se
 * acepta si cumple TODO esto:
 *
 *   - pasa el dígito verificador, tiene fecha real y entidad conocida, y
 *   - cuadra con cada posición que se pudo calcular del nombre, la fecha y el
 *     sexo (si no hay suficiente para comprobarlo, solo se aceptan confusiones
 *     de foto), y
 *   - es la ÚNICA con el menor número de cambios. Si hay empate, es ambigua y
 *     no se toca.
 */
export function repararCurp(leida, esperado = Array(18).fill(null)) {
  const original = normalizarCurp(leida);
  if (!original) return null;

  const conocidas = esperado.filter((letra) => letra !== null).length;
  const hayConQueComprobar = conocidas >= 8;
  // Con un carácter de más o de menos solo se prueban las confusiones de foto:
  // probar además cada sustitución son decenas de miles de combinaciones.
  const probarSustituciones = hayConQueComprobar && original.length === 18;
  const encontrados = new Map(); // curp → { curp, cambios, distancia, indel }

  const considerar = (candidata, base) => {
    // Lo barato primero: cuadrar con el nombre descarta casi todo.
    if (diferencias(candidata, esperado).length > 0) return;
    if (!esPosible(candidata)) return;
    const cambios = cambiosEntre(base, candidata);
    const indel = base !== original;
    const distancia = cambios.length + (indel ? 1 : 0);
    const previo = encontrados.get(candidata);
    if (!previo || distancia < previo.distancia) {
      encontrados.set(candidata, { curp: candidata, cambios, distancia, indel });
    }
  };

  for (const base of basesDeLargo18(original)) {
    const limpia = sinConfusiones(base);
    considerar(limpia, base);
    if (!probarSustituciones) continue;

    // Un solo carácter distinto, sobre la lectura cruda y sobre la ya limpia.
    for (const partida of new Set([base, limpia])) {
      for (let i = 0; i < 18; i += 1) {
        const tipo = tipoDePosicion(i);
        const alfabeto = tipo === 'L' ? LETRAS : tipo === 'D' ? DIGITOS : LETRAS + DIGITOS;
        for (const letra of alfabeto) {
          if (letra === partida[i]) continue;
          considerar(partida.slice(0, i) + letra + partida.slice(i + 1), base);
        }
      }
    }
  }

  if (encontrados.size === 0) return null;

  // Sin con qué comprobarla, una corrección solo vale si es pura confusión de foto
  // (no se movieron caracteres) y es la única.
  const todas = [...encontrados.values()]
    .filter((candidata) => hayConQueComprobar || !candidata.indel)
    .sort((a, b) => a.distancia - b.distancia);
  if (todas.length === 0) return null;
  const mejor = todas[0];
  const empatadas = todas.filter((candidata) => candidata.distancia === mejor.distancia);
  if (empatadas.length > 1) return { ambigua: true, candidatas: empatadas.map((c) => c.curp) };
  // Una corrección que cambia más de 2 caracteres ya no es un error de foto.
  if (mejor.distancia > 2) return null;
  return { ambigua: false, curp: mejor.curp, cambios: mejor.cambios, indel: mejor.indel, largo: original.length };
}

const describirCambios = (cambios, indel, largo) => {
  const detalle = cambios.map((c) => `posición ${c.posicion}: «${c.de || '—'}» → «${c.a || '—'}»`);
  if (indel) detalle.unshift(largo > 18 ? 'sobraba un carácter' : 'faltaba un carácter');
  return detalle.join('; ');
};

/**
 * Lo que se sabe de la CURP del cliente.
 *
 * Recibe la CURP del frente de la INE, la del reverso si se leyó, y el nombre,
 * la fecha y el sexo leídos del frente. Devuelve:
 *
 *   curp        la que se debe usar (corregida si hizo falta)
 *   valida      pasa formato y dígito verificador
 *   corregida   se arregló una lectura equivocada
 *   estado      el estado de nacimiento (entrada de geografia.js) o null
 *   fecha       AAAA-MM-DD sacada de la CURP, o ''
 *   sexo        H / M sacado de la CURP, o ''
 *   avisos      [{ campo, mensaje }] para la revisión
 */
export function analizarCurp({ curp, curpReverso, nombres, paterno, materno, fechaNacimiento, sexo } = {}) {
  const avisos = [];
  const frente = normalizarCurp(curp);
  const reverso = normalizarCurp(curpReverso);
  const esperado = posicionesEsperadas({ nombres, paterno, materno, fechaNacimiento, sexo });

  const lecturas = [...new Set([frente, reverso].filter(Boolean))];
  const resultado = (usar, extra = {}) => {
    const limpia = normalizarCurp(usar);
    const valida = esPosible(limpia);
    return {
      curp: limpia,
      valida,
      corregida: false,
      estado: valida ? estadoPorCurp(limpia) : null,
      fecha: valida ? fechaDeCurp(limpia) ?? '' : '',
      sexo: valida ? sexoDeCurp(limpia) : '',
      avisos,
      ...extra,
    };
  };

  if (lecturas.length === 0) return resultado('');

  // 1. Una de las dos lecturas ya es buena. Gana la que además cuadra con el nombre.
  const buenas = lecturas.filter(esPosible);
  if (buenas.length > 0) {
    const elegida = [...buenas].sort(
      (a, b) => diferencias(a, esperado).length - diferencias(b, esperado).length,
    )[0];

    if (frente && reverso && frente !== reverso) {
      const otra = elegida === frente ? reverso : frente;
      avisos.push({
        campo: 'curp',
        mensaje: esPosible(otra)
          ? `Las dos CURP leídas son válidas pero distintas: frente ${frente}, reverso ${reverso}. ` +
            `Se usó ${elegida}, la que cuadra con el nombre; compáralas con la credencial.`
          : `La CURP del ${elegida === frente ? 'reverso' : 'frente'} (${otra}) no pasa la verificación; ` +
            `se usó la del ${elegida === frente ? 'frente' : 'reverso'} (${elegida}).`,
      });
    }

    const faltas = diferencias(elegida, esperado);
    const deFecha = faltas.filter((falta) => falta.posicion >= 5 && falta.posicion <= 10);
    const otras = faltas.filter((falta) => falta.posicion < 5 || falta.posicion > 10);
    if (deFecha.length > 0) {
      // La CURP pasó la verificación: su fecha es la de fiar, y la de la INE
      // es la que pudo leerse mal.
      avisos.push({
        campo: 'fechaNacimiento',
        mensaje:
          `La fecha de nacimiento leída de la INE (${fechaNacimiento}) no coincide con la de la CURP ` +
          `${elegida} (${fechaDeCurp(elegida)}). Se usó la de la CURP, que sí pasó la verificación.`,
      });
    }
    if (otras.length > 0) {
      const que = [...new Set(otras.map((falta) => NOMBRE_POSICION(falta.posicion)))].join(', ');
      avisos.push({
        campo: 'curp',
        mensaje:
          `La CURP ${elegida} es válida, pero no cuadra con ${que} que se leyeron. ` +
          'Revisa si se leyó mal el nombre, el sexo o la CURP.',
      });
    }
    return resultado(elegida);
  }

  // 2. Ninguna pasa. Se intenta corregir, primero la del frente.
  const intentos = [];
  for (const lectura of lecturas) {
    const arreglo = repararCurp(lectura, esperado);
    if (!arreglo) continue;
    if (arreglo.ambigua) {
      intentos.push({ lectura, ambigua: arreglo.candidatas });
      continue;
    }
    // Si las dos lecturas se arreglan al mismo resultado, la confianza es mayor.
    intentos.push({ lectura, ...arreglo });
  }

  const unicas = [...new Set(intentos.filter((i) => i.curp).map((i) => i.curp))];
  if (unicas.length === 1) {
    const elegido = intentos.find((i) => i.curp === unicas[0]);
    avisos.push({
      campo: 'curp',
      mensaje:
        `La CURP leída «${elegido.lectura}» no pasaba la verificación (su dígito verificador no cuadra). ` +
        `Se corrigió a «${elegido.curp}» (${describirCambios(elegido.cambios, elegido.indel, elegido.largo)}), que sí cuadra con el nombre, ` +
        'la fecha y el sexo. Compárala con la credencial antes de capturar.',
    });
    return resultado(elegido.curp, { corregida: true });
  }

  const motivo = lecturas.length > 1 ? 'Ninguna de las dos CURP leídas' : 'La CURP leída';
  const ambiguas = [...new Set(intentos.flatMap((i) => i.ambigua ?? []))];
  const pocas = ambiguas.slice(0, 3);
  avisos.push({
    campo: 'curp',
    mensaje:
      `${motivo} (${lecturas.join(' / ')}) no pasa la verificación y no se pudo corregir con seguridad` +
      `${pocas.length ? `; podría ser ${pocas.join(' o ')}${ambiguas.length > 3 ? ' u otras' : ''}` : ''}. ` +
      'Escríbela a mano desde la credencial.',
  });
  return resultado(frente || reverso);
}
