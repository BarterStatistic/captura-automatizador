// Estados, municipios y direcciones: se deduce lo que se puede y no se inventa el resto.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MUNICIPIOS_COAHUILA,
  analizarDireccion,
  estadoPorCp,
  estadoPorCurp,
  estadoPorTexto,
  limpiarMunicipio,
  municipioDeCoahuila,
  resolverEstado,
  separarEstado,
} from '../src/lib/geografia.js';

test('el estado de nacimiento sale de las posiciones 12 y 13 de la CURP', () => {
  assert.equal(estadoPorCurp('PEGJ900115HCLRMN08').dinamo, 'COAHUILA');
  assert.equal(estadoPorCurp('PEGJ900115HNLRMN08').dinamo, 'NUEVO LEON');
  assert.equal(estadoPorCurp('PEGJ900115HDFRMN08').dinamo, 'CIUDAD DE MEXICO');
  assert.equal(estadoPorCurp('PEGJ900115HMCRMN08').dinamo, 'MEXICO');
  assert.equal(estadoPorCurp('PEGJ900115HNERMN08'), null, 'NE: nació en el extranjero');
  assert.equal(estadoPorCurp('PEGJ900115HXXRMN08'), null);
});

test('cada estado de la CURP existe como opción de Dinamo', () => {
  // Los 32 estados con su texto exacto de cboedo_nac.
  const claves = ['AS', 'BC', 'BS', 'CC', 'CL', 'CM', 'CS', 'CH', 'DF', 'DG', 'GT', 'GR', 'HG', 'JC', 'MC', 'MN', 'MS', 'NT', 'NL', 'OC', 'PL', 'QT', 'QR', 'SP', 'SL', 'SR', 'TC', 'TS', 'TL', 'VZ', 'YN', 'ZS'];
  for (const clave of claves) {
    assert.ok(estadoPorCurp(`PEGJ900115H${clave}RMN08`), clave);
  }
});

test('el código postal da el estado por sus dos primeras cifras', () => {
  assert.equal(estadoPorCp('25114').dinamo, 'COAHUILA');
  assert.equal(estadoPorCp('27000').dinamo, 'COAHUILA', 'Torreón');
  assert.equal(estadoPorCp('64000').dinamo, 'NUEVO LEON');
  assert.equal(estadoPorCp('06600').dinamo, 'CIUDAD DE MEXICO');
  assert.equal(estadoPorCp('50000').dinamo, 'MEXICO');
  assert.equal(estadoPorCp('2511'), null);
  assert.equal(estadoPorCp('abcde'), null);
});

test('las siglas de un recibo se reconocen: COAH, N.L., Tamps.', () => {
  assert.equal(estadoPorTexto('Coah.').dinamo, 'COAHUILA');
  assert.equal(estadoPorTexto('N.L.').dinamo, 'NUEVO LEON');
  assert.equal(estadoPorTexto('Tamps').dinamo, 'TAMAULIPAS');
  assert.equal(estadoPorTexto('Nuevo León').dinamo, 'NUEVO LEON');
  assert.equal(estadoPorTexto('Saltillo'), null);
});

test('el estado pegado al municipio se separa, pero «Villa Guerrero» sigue siendo un municipio', () => {
  assert.deepEqual(
    { resto: separarEstado('SALTILLO, COAH.').resto, estado: separarEstado('SALTILLO, COAH.').estado.dinamo },
    { resto: 'SALTILLO', estado: 'COAHUILA' },
  );
  assert.equal(separarEstado('SALTILLO COAH').resto, 'SALTILLO');
  assert.equal(separarEstado('MONTERREY NL').estado.dinamo, 'NUEVO LEON');
  assert.equal(separarEstado('VILLA GUERRERO').estado, null);
});

test('el municipio se limpia de prefijos, estado y paréntesis', () => {
  assert.equal(limpiarMunicipio('MUNICIPIO DE SALTILLO, COAH.').municipio, 'SALTILLO');
  assert.equal(limpiarMunicipio('saltillo').municipio, 'SALTILLO');
  assert.equal(limpiarMunicipio('Ramos Arizpe (Coahuila)').municipio, 'RAMOS ARIZPE');
  assert.equal(limpiarMunicipio('SALTILLO, COAH.').estado.dinamo, 'COAHUILA');
  assert.deepEqual(limpiarMunicipio(null), { municipio: '', estado: null });
});

test('el catálogo de Coahuila tiene los 38 municipios de Dinamo y acepta alias', () => {
  assert.equal(MUNICIPIOS_COAHUILA.length, 38);
  assert.equal(municipioDeCoahuila('Cd. Acuña'), 'ACUÑA');
  assert.equal(municipioDeCoahuila('Parras de la Fuente'), 'PARRAS');
  assert.equal(municipioDeCoahuila('saltillo'), 'SALTILLO');
  assert.equal(municipioDeCoahuila('Monterrey'), '', 'no es de Coahuila: no se inventa');
});

test('resolverEstado: el texto manda, el CP respalda y avisa si chocan', () => {
  assert.equal(resolverEstado({ texto: 'COAHUILA', cp: '25114' }).aviso, '');
  assert.equal(resolverEstado({ texto: '', cp: '25114' }).estado.dinamo, 'COAHUILA');
  assert.equal(resolverEstado({ texto: '', cp: '25114' }).origen, 'cp');
  assert.equal(resolverEstado({ texto: 'COAH.' }).origen, 'texto');
  assert.equal(resolverEstado({ municipio: 'SALTILLO, COAH.' }).estado.dinamo, 'COAHUILA');

  const choque = resolverEstado({ texto: 'NUEVO LEON', cp: '25114' });
  assert.equal(choque.estado.dinamo, 'NUEVO LEON');
  assert.match(choque.aviso, /NUEVO LEON.*25114.*COAHUILA/);

  assert.equal(resolverEstado({}).estado, null);
});

// --- Direcciones ----------------------------------------------------------------

test('la dirección del formulario nuevo se parte en calle, colonia, CP, municipio y estado', () => {
  const d = analizarDireccion(
    'Cerca de Av. Las Industrias, Parque Industrial Norte, 25114 Saltillo, Coah.',
  );

  assert.equal(d.calle, 'Av. Las Industrias');
  assert.equal(d.colonia, 'Parque Industrial Norte');
  assert.equal(d.cp, '25114');
  assert.equal(d.municipio, 'SALTILLO');
  assert.equal(d.estado.dinamo, 'COAHUILA');
  assert.equal(d.numeroExterior, '', 'el CP nunca se toma por número exterior');
  assert.equal(d.referencia, true, '«Cerca de» dice dónde queda, no cómo se llama la calle');
});

test('número con #, colonia pegada a la calle y CP al final', () => {
  const d = analizarDireccion('Blvd. Los Rodríguez 2000 Col. Centro, Ramos Arizpe, Coahuila CP 25900');

  assert.equal(d.calle, 'Blvd. Los Rodríguez');
  assert.equal(d.numeroExterior, '2000');
  assert.equal(d.colonia, 'Centro');
  assert.equal(d.municipio, 'RAMOS ARIZPE');
  assert.equal(d.cp, '25900');
  assert.equal(d.estado.dinamo, 'COAHUILA');

  const conNumeral = analizarDireccion('Calle 5 de Mayo #123, Fracc. Las Flores, Saltillo');
  assert.equal(conNumeral.calle, '5 de Mayo');
  assert.equal(conNumeral.numeroExterior, '123');
  assert.equal(conNumeral.colonia, 'Las Flores');
});

test('sin CP ni estado en el texto no se inventa municipio ni estado', () => {
  const d = analizarDireccion('Calle Juárez 300, Colonia Centro');

  assert.equal(d.calle, 'Juárez');
  assert.equal(d.numeroExterior, '300');
  assert.equal(d.colonia, 'Centro');
  assert.equal(d.municipio, '');
  assert.equal(d.estado, null);
  assert.equal(d.cp, '');
});

test('sin CP pero con sigla de estado: estado del texto, municipio el último segmento', () => {
  const d = analizarDireccion('Av. Universidad 500, Del Valle, Monterrey, N.L.');

  assert.equal(d.estado.dinamo, 'NUEVO LEON');
  assert.equal(d.municipio, 'MONTERREY');
  assert.equal(d.colonia, 'Del Valle');
});

test('una dirección vacía o de una sola palabra no revienta', () => {
  assert.equal(analizarDireccion('').calle, '');
  assert.equal(analizarDireccion(null).estado, null);
  assert.equal(analizarDireccion('Industrial').calle, 'Industrial');
});
