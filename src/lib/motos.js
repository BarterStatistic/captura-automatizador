// Catálogo de motos para el campo Modelo.
//
// Copiado de `MODELS` del cotizador vigente (ProspecTeam/Cotizadores/cotizador-pt,
// «Lista Dinamo vigente 25/08/2026»). Allá cada cotizador tiene su propia copia;
// si cambia el catálogo de Dinamo, hay que actualizar también esta.
//
// La extensión elige el modelo en `cbomodelos` por el texto que ve una persona,
// así que estos nombres tienen que coincidir con los de Dinamo.

export const MODELOS = [
  'U2',
  'KF-RACER',
  'U5',
  'U5 175',
  'METRO',
  'ADVENTURE ELITE',
  'ADVENTURE ELITE 175',
  'ALIEN R 175',
  'ROCKY 125',
  'SCORPION 200',
  'CUSTOM 150',
  'CUSTOM BLACK',
  'RAYO 175',
  'CHOPPER',
  'RENEGADA 250',
  'SCORPION XT',
  'RAYO ELITE 250',
  'R2 GT',
  'SPEEDFIRE SPDF 250',
  'DNM 2.5',
  'R4',
  'HEAVY-B CAB',
  'XTREME RLX 200',
  'CROSS COUNTRY ADV',
  'DNM 4 400',
  'GOLIAT',
  'B52 250',
  'SUPER SPORT 400',
  'HEAVY CAB - R 200',
  'SKELETON',
  'DNM 3.0',
  'COMANDO',
  'MOTO TX',
  'MOLOTOV C2',
  'HEAVY MAX 250',
  'BANDID',
  'HEAVY CAB 300',
];

/** En orden alfabético, para encontrarlas rápido en el menú. */
export const MODELOS_ORDENADOS = [...MODELOS].sort((a, b) => a.localeCompare(b, 'es'));

/** Sin acentos, signos ni espacios, para comparar «Heavy cab 300» con «HEAVY CAB 300». */
const clave = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, '');

/**
 * El modelo del catálogo que corresponde a lo que escribió el vendedor, o null.
 *
 * Primero la coincidencia exacta; si no, el nombre más largo contenido en el
 * texto («una U5 175 roja» es U5 175, no U5).
 */
export function modeloPorNombre(escrito) {
  const buscado = clave(escrito);
  if (!buscado) return null;

  const exacto = MODELOS.find((modelo) => clave(modelo) === buscado);
  if (exacto) return exacto;

  const contenidos = MODELOS.filter((modelo) => buscado.includes(clave(modelo))).sort(
    (a, b) => clave(b).length - clave(a).length,
  );
  return contenidos[0] ?? null;
}

// --- Colores -----------------------------------------------------------------
//
// En Dinamo el color es un <select> (`cbocolores`) que se carga según el modelo,
// con nombres en mayúsculas («AMARILLO», «GRIS», «ROJO» en el HTML del
// 2026-10-02). No hay catálogo de colores por modelo, así que aquí van los
// nombres de color de moto; la extensión busca el elegido en las opciones de
// ese modelo y, si no viene en ese color, la bitácora dice cuáles hay.

export const COLORES = [
  'NEGRO',
  'BLANCO',
  'ROJO',
  'AZUL',
  'GRIS',
  'PLATA',
  'AMARILLO',
  'VERDE',
  'NARANJA',
  'MORADO',
  'ROSA',
  'CAFE',
  'DORADO',
];

// Cómo lo escribe la gente → cómo lo nombra Dinamo.
const SINONIMOS = {
  PLATEADO: 'PLATA',
  MARRON: 'CAFE',
  CHOCOLATE: 'CAFE',
  GUINDA: 'ROJO',
  VINO: 'ROJO',
  ARENA: 'CAFE',
  OLIVO: 'VERDE',
  LILA: 'MORADO',
  VIOLETA: 'MORADO',
};

/**
 * El color del catálogo que corresponde a lo que escribió el vendedor, o null.
 * «rojo con negro» es ROJO: se toma el primer color que se menciona.
 */
export function colorPorNombre(escrito) {
  const palabras = String(escrito ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);

  for (const palabra of palabras) {
    if (COLORES.includes(palabra)) return palabra;
    if (SINONIMOS[palabra]) return SINONIMOS[palabra];
  }
  return null;
}
