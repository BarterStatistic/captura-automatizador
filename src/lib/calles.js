// Calles reales de la zona metropolitana de Saltillo, para generar el domicilio
// de las referencias.
//
// Ese domicilio es ficticio a propósito: el formulario de Dinamo lo exige y el
// cliente no lo proporciona. Es una decisión del usuario, tomada el 2026-08-31
// y registrada en el spec. Se usan calles que existen para que el dato al menos
// sea verosímil, y la app lo marca en pantalla como generado para que quien
// revisa sepa que no salió de ningún documento.

export const CIUDADES = ['SALTILLO', 'RAMOS ARIZPE', 'ARTEAGA'];

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
  ],
  ARTEAGA: [
    'MATAMOROS',
    'ABASOLO',
    'LERDO DE TEJADA',
    'MIGUEL HIDALGO',
    'FRANCISCO I MADERO',
    'LOPEZ MATEOS',
    'SAN ANTONIO',
  ],
};

/**
 * Generador determinista sencillo.
 *
 * Determinista a propósito: si alguien revisa la captura después y vuelve a
 * abrir el mismo expediente, tiene que ver el mismo domicilio. Un Math.random()
 * daría uno distinto cada vez y nadie podría cotejar nada.
 */
function siguiente(semilla) {
  // Hash entero de 32 bits (xorshift), suficiente para repartir sin patrones
  // visibles entre unas pocas decenas de calles.
  let x = (Number(semilla) || 1) >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;
  x >>>= 0;
  return x;
}

/**
 * Devuelve un domicilio verosímil para una referencia.
 * `semilla` fija el resultado: la misma semilla da siempre lo mismo.
 */
export function generarDomicilio(ciudad, semilla = 1) {
  const nombre = CIUDADES.includes(ciudad) ? ciudad : 'SALTILLO';
  const calles = CALLES[nombre];

  const a = siguiente(semilla);
  const b = siguiente(a);

  return {
    ciudad: nombre,
    calle: calles[a % calles.length],
    // Entre 100 y 9999: el rango en que caen los números de casa de la zona.
    numeroExterior: String(100 + (b % 9900)),
    ficticio: true,
  };
}
