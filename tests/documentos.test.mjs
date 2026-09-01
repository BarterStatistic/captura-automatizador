// Los seis documentos que se arrastran, con el prompt y el esquema que se le
// manda a Gemini por cada uno.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DOCUMENTOS,
  TIPOS_ACEPTADOS,
  documentoPorId,
  tipoAceptado,
} from '../src/lib/documentos.js';

test('son seis documentos, en el orden en que se arrastran', () => {
  assert.deepEqual(
    DOCUMENTOS.map((doc) => doc.id),
    ['ineFrente', 'ineAtras', 'comprobante', 'estadoCuenta1', 'estadoCuenta2', 'formulario'],
  );
});

test('cada documento trae prompt y esquema utilizables', () => {
  for (const doc of DOCUMENTOS) {
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
