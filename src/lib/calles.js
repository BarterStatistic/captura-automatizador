// Calles reales de la zona metropolitana de Saltillo, para generar el domicilio
// de las referencias.
//
// Ese domicilio es ficticio a propósito: el formulario de Dinamo lo exige y el
// cliente no lo proporciona. Es una decisión del usuario, tomada el 2026-08-31
// y registrada en el spec. Se usan calles que existen para que el dato al menos
// sea verosímil, y la app lo marca en pantalla como generado para que quien
// revisa sepa que no salió de ningún documento.

export const CIUDADES = ['SALTILLO', 'RAMOS ARIZPE', 'ARTEAGA'];

// Calles del centro y de las colonias viejas de cada ciudad: nombres de próceres
// que existen en las tres. Muchas, para que dos clientes casi nunca caigan en la
// misma calle.
export const CALLES = {
  SALTILLO: [
    'ALLENDE',
    'HIDALGO',
    'VICTORIA',
    'ALDAMA',
    'ZARAGOZA',
    'ACUÑA',
    'JUAREZ',
    'PEREZ TREVIÑO',
    'CUAUHTEMOC',
    'EMILIO CARRANZA',
    'GENERAL CEPEDA',
    'PADRE FLORES',
    'BRAVO',
    'MORELOS',
    'ABASOLO',
    'XICOTENCATL',
    'RAMOS ARIZPE',
    'MUZQUIZ',
    'OBREGON',
    'DE LA FUENTE',
    'CASTELAR',
    'PURCELL',
    'ESCOBEDO',
    'OCAMPO',
    'MATAMOROS',
    'BOLIVAR',
    'LEONA VICARIO',
    'MINA',
    'GUERRERO',
    'GALEANA',
    'PRESIDENTE CARDENAS',
  ],
  'RAMOS ARIZPE': [
    'MORELOS',
    'GUERRERO',
    'INDEPENDENCIA',
    'CENTENARIO',
    'IGNACIO ZARAGOZA',
    'BENITO JUAREZ',
    'JOSEFA ORTIZ',
    'CINCO DE MAYO',
    'MIGUEL HIDALGO',
    'IGNACIO ALLENDE',
    'GUADALUPE VICTORIA',
    'JUAN ALDAMA',
    'MATAMOROS',
    'ABASOLO',
    'NICOLAS BRAVO',
    'FRANCISCO I MADERO',
    'MELCHOR OCAMPO',
    'VENUSTIANO CARRANZA',
    'EMILIANO ZAPATA',
    'LAZARO CARDENAS',
  ],
  ARTEAGA: [
    'MATAMOROS',
    'ABASOLO',
    'LERDO DE TEJADA',
    'MIGUEL HIDALGO',
    'FRANCISCO I MADERO',
    'LOPEZ MATEOS',
    'SAN ANTONIO',
    'BENITO JUAREZ',
    'IGNACIO ZARAGOZA',
    'IGNACIO ALLENDE',
    'MORELOS',
    'GUERRERO',
    'GUADALUPE VICTORIA',
    'NICOLAS BRAVO',
    'INDEPENDENCIA',
    'VENUSTIANO CARRANZA',
    'EMILIANO ZAPATA',
    'ALDAMA',
  ],
};

// Números de casa entre 100 y 3999: el rango en que caen los de la zona.
const NUMERO_MINIMO = 100;
const NUMERO_MAXIMO = 3999;

/** Un entero al azar en [0, n). `aleatorio` se puede fijar en las pruebas. */
function alAzar(n, aleatorio) {
  return Math.min(n - 1, Math.floor(aleatorio() * n));
}

/**
 * Devuelve un domicilio al azar para una referencia.
 *
 * Al azar a propósito (antes salía siempre el mismo por cliente y entre
 * clientes se repetía): una vez generado se guarda en el expediente, así que
 * quien revise después ve el mismo.
 *
 * `evitar` son calles que no deben salir: las de las otras referencias del
 * mismo cliente y las que se usaron hace poco. Si ya no queda ninguna fuera de
 * `evitar`, se elige entre todas (nunca se queda sin domicilio).
 */
export function generarDomicilio(ciudad, { evitar = [], aleatorio = Math.random } = {}) {
  const nombre = CIUDADES.includes(ciudad) ? ciudad : 'SALTILLO';
  const calles = CALLES[nombre];
  const prohibidas = new Set(evitar);
  const libres = calles.filter((calle) => !prohibidas.has(calle));
  const opciones = libres.length > 0 ? libres : calles;

  return {
    ciudad: nombre,
    calle: opciones[alAzar(opciones.length, aleatorio)],
    numeroExterior: String(
      NUMERO_MINIMO + alAzar(NUMERO_MAXIMO - NUMERO_MINIMO + 1, aleatorio),
    ),
    ficticio: true,
  };
}

/**
 * Varios domicilios para las referencias de un mismo cliente, cada uno en una
 * calle distinta. `evitar` son calles a no usar (las recientes).
 */
export function generarDomicilios(ciudad, cantidad, { evitar = [], aleatorio = Math.random } = {}) {
  const lista = [];
  for (let i = 0; i < cantidad; i += 1) {
    const usadas = lista.map((domicilio) => domicilio.calle);
    // Primero se evitan las recientes y las ya elegidas; si eso deja sin calle,
    // basta con no repetir dentro del mismo cliente.
    const nombre = CIUDADES.includes(ciudad) ? ciudad : 'SALTILLO';
    const sinRecientes = CALLES[nombre].filter(
      (calle) => !usadas.includes(calle) && !evitar.includes(calle),
    );
    lista.push(
      generarDomicilio(ciudad, {
        evitar: sinRecientes.length > 0 ? [...usadas, ...evitar] : usadas,
        aleatorio,
      }),
    );
  }
  return lista;
}

// --- Calles usadas hace poco ----------------------------------------------------
//
// Se recuerdan en este navegador las últimas calles generadas, para que dos
// clientes seguidos no compartan calle. Es una comodidad: si el navegador no
// deja guardar (ventana privada), todo sigue funcionando sin memoria.

const CLAVE_RECIENTES = 'captura-calles-recientes';
const CUANTAS_RECORDAR = 24;

/** Las calles usadas hace poco en esta ciudad. */
export function callesRecientes(ciudad) {
  try {
    const guardado = JSON.parse(globalThis.localStorage?.getItem(CLAVE_RECIENTES) ?? '[]');
    return guardado
      .filter((entrada) => entrada?.ciudad === ciudad)
      .map((entrada) => entrada.calle);
  } catch {
    return [];
  }
}

/** Anota calles recién generadas; se queda con las últimas por ciudad. */
export function anotarCalles(ciudad, calles) {
  try {
    const guardado = JSON.parse(globalThis.localStorage?.getItem(CLAVE_RECIENTES) ?? '[]');
    const nuevas = calles.map((calle) => ({ ciudad, calle }));
    // Cuántas recordar depende de cuántas calles hay: siempre deja libres al
    // menos tres (lo que pide MOTOXPRESS).
    const limite = Math.max(0, Math.min(CUANTAS_RECORDAR, (CALLES[ciudad]?.length ?? 0) - 3));
    const deEsta = [...guardado.filter((e) => e?.ciudad === ciudad), ...nuevas].slice(-limite);
    const otras = guardado.filter((e) => e?.ciudad !== ciudad);
    globalThis.localStorage?.setItem(CLAVE_RECIENTES, JSON.stringify([...otras, ...deEsta]));
  } catch {
    // Sin almacenamiento: no pasa nada, solo no hay memoria entre clientes.
  }
}
