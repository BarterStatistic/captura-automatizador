// Los seis documentos que se arrastran, con el prompt y el esquema que se le
// manda a Gemini por cada uno.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASIFICADOR,
  DOCUMENTOS,
  FORMULARIO,
  TIPOS_ACEPTADOS,
  TIPOS_CLASIFICACION,
  documentoPorId,
  normalizarArchivo,
  ranurasPara,
  tipoAceptado,
} from '../src/lib/documentos.js';

test('son cinco casillas de archivo, en el orden en que se muestran', () => {
  assert.deepEqual(
    DOCUMENTOS.map((doc) => doc.id),
    ['ineFrente', 'ineAtras', 'comprobante', 'estadoCuenta1', 'estadoCuenta2'],
  );
});

test('el formulario ya no es un archivo: se lee del texto que pega el capturista', () => {
  assert.equal(documentoPorId('formulario'), null);
  assert.equal(FORMULARIO.id, 'formulario');
  assert.match(FORMULARIO.prompt, /vendedor/i);
});

test('el formulario extrae también el celular del cliente y los datos de la venta', () => {
  for (const campo of ['celular', 'modelo', 'esquema', 'plazo', 'referencias_extra']) {
    assert.ok(campo in FORMULARIO.esquema.properties, `falta ${campo}`);
  }
});

test('cada documento trae prompt y esquema utilizables', () => {
  for (const doc of [...DOCUMENTOS, FORMULARIO]) {
    assert.ok(doc.etiqueta, `${doc.id} necesita etiqueta`);
    assert.ok(doc.prompt.length > 50, `${doc.id} necesita un prompt real`);
    assert.equal(doc.esquema.type, 'object', `${doc.id} necesita esquema de objeto`);
    assert.ok(
      Object.keys(doc.esquema.properties).length > 0,
      `${doc.id} necesita propiedades en su esquema`,
    );
  }
});

test('el prompt del comprobante prohíbe tomar el RFC genérico', () => {
  const comprobante = documentoPorId('comprobante');

  assert.match(comprobante.prompt, /XAXX010101000/);
});

test('el prompt del comprobante advierte que el titular puede ser otra persona', () => {
  const comprobante = documentoPorId('comprobante');

  assert.match(comprobante.prompt, /otra persona|no es necesariamente|puede estar a nombre/i);
});

test('el prompt del reverso pide el OCR de 13 dígitos', () => {
  const ineAtras = documentoPorId('ineAtras');

  assert.match(ineAtras.prompt, /13/);
  assert.ok('ocr' in ineAtras.esquema.properties, 'el esquema debe traer el campo ocr');
});

test('los estados de cuenta piden sueldo y frecuencia', () => {
  const estado = documentoPorId('estadoCuenta1');

  assert.ok('sueldo_mensual' in estado.esquema.properties);
  assert.ok('frecuencia_pago' in estado.esquema.properties);
});

test('los dos estados de cuenta comparten prompt y esquema', () => {
  const uno = documentoPorId('estadoCuenta1');
  const dos = documentoPorId('estadoCuenta2');

  assert.equal(uno.prompt, dos.prompt);
  assert.deepEqual(uno.esquema, dos.esquema);
});

test('se aceptan PDF, porque los estados de cuenta llegan así', () => {
  assert.ok(tipoAceptado('application/pdf'));
  assert.ok(TIPOS_ACEPTADOS.has('application/pdf'));
});

test('se aceptan las fotos que manda un celular', () => {
  assert.ok(tipoAceptado('image/jpeg'));
  assert.ok(tipoAceptado('image/png'));
  assert.ok(tipoAceptado('image/heic'));
});

test('un formato que Gemini no lee se rechaza', () => {
  assert.equal(tipoAceptado('application/zip'), false);
  assert.equal(tipoAceptado(''), false);
});

test('un id que no existe no devuelve documento', () => {
  assert.equal(documentoPorId('recibo-de-luz'), null);
});

test('una foto sin tipo se reconoce por su extensión', () => {
  const heic = normalizarArchivo(new File(['x'], 'IMG_0001.HEIC', { type: '' }));
  assert.equal(heic.type, 'image/heic');
  assert.equal(heic.name, 'IMG_0001.HEIC');

  const raro = normalizarArchivo(new File(['x'], 'notas.txt', { type: '' }));
  assert.equal(tipoAceptado(raro.type), false);
});

// --- Clasificación ------------------------------------------------------------

test('el clasificador solo puede contestar tipos conocidos', () => {
  assert.deepEqual(CLASIFICADOR.esquema.properties.tipo.enum, TIPOS_CLASIFICACION);
});

test('cada lado de la INE va a su casilla, y una foto con ambos lados a las dos', () => {
  assert.deepEqual(ranurasPara('INE_FRENTE'), ['ineFrente']);
  assert.deepEqual(ranurasPara('INE_ATRAS'), ['ineAtras']);
  assert.deepEqual(ranurasPara('INE_AMBOS'), ['ineFrente', 'ineAtras']);
  assert.deepEqual(ranurasPara('COMPROBANTE'), ['comprobante']);
});

test('los estados de cuenta llenan primero la casilla 1 y luego la 2', () => {
  assert.deepEqual(ranurasPara('ESTADO_CUENTA', new Set()), ['estadoCuenta1']);
  assert.deepEqual(ranurasPara('ESTADO_CUENTA', new Set(['estadoCuenta1'])), ['estadoCuenta2']);
});

test('un tercer estado de cuenta reemplaza al segundo, nunca al principal', () => {
  const llenas = new Set(['estadoCuenta1', 'estadoCuenta2']);
  assert.deepEqual(ranurasPara('ESTADO_CUENTA', llenas), ['estadoCuenta2']);
});

test('lo que no se reconoce no se mete en ninguna casilla', () => {
  assert.deepEqual(ranurasPara('OTRO'), []);
  assert.deepEqual(ranurasPara(null), []);
  assert.deepEqual(ranurasPara('SELFIE'), []);
});

test('el formulario sigue el esqueleto que mandan los vendedores, con el NSS', () => {
  assert.match(FORMULARIO.prompt, /7\) Número de seguro social/);
  assert.match(FORMULARIO.prompt, /toda la\s+vida/);
  assert.ok('nss' in FORMULARIO.esquema.properties);
});
