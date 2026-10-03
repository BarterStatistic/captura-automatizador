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
  documentosDe,
  normalizarArchivo,
  ranurasPara,
  tipoAceptado,
} from '../src/lib/documentos.js';

test('son cuatro casillas de archivo, con un solo comprobante de ingresos', () => {
  assert.deepEqual(
    DOCUMENTOS.map((doc) => doc.id),
    ['ineFrente', 'ineAtras', 'comprobante', 'ingresos'],
  );
});

test('MOTOXPRESS no tiene casilla de comprobante de ingresos; los demás sí', () => {
  const ids = (tipo) => documentosDe(tipo).map((doc) => doc.id);

  for (const tipo of ['2', '52', '1', '53']) {
    assert.deepEqual(ids(tipo), ['ineFrente', 'ineAtras', 'comprobante', 'ingresos'], tipo);
  }
  for (const tipo of ['15', '51']) {
    assert.deepEqual(ids(tipo), ['ineFrente', 'ineAtras', 'comprobante'], tipo);
  }
  assert.ok(documentosDe(tipoSinElegir()).some((doc) => doc.id === 'ingresos'));
});

function tipoSinElegir() {
  return '';
}

test('el formulario ya no es un archivo: se lee del texto que pega el capturista', () => {
  assert.equal(documentoPorId('formulario'), null);
  assert.equal(FORMULARIO.id, 'formulario');
  assert.match(FORMULARIO.prompt, /vendedor/i);
});

test('el formulario extrae también el celular, el tipo de crédito y más referencias', () => {
  for (const campo of ['celular', 'esquema', 'referencias_extra']) {
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

test('el comprobante de ingresos distingue estado de cuenta y recibo de nómina', () => {
  const ingresos = documentoPorId('ingresos');
  const campos = ingresos.esquema.properties;

  assert.deepEqual(campos.tipo_comprobante.enum, ['ESTADO_CUENTA', 'RECIBO_NOMINA']);
  for (const campo of ['depositos_nomina', 'frecuencia_pago', 'monto_recibo']) {
    assert.ok(campo in campos, `falta ${campo}`);
  }
  assert.match(ingresos.prompt, /no lo conviertas a mensual/i);
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

test('estados de cuenta y recibos de nómina van a la única casilla de ingresos', () => {
  assert.deepEqual(ranurasPara('ESTADO_CUENTA'), ['ingresos']);
  assert.deepEqual(ranurasPara('RECIBO_NOMINA'), ['ingresos']);
  assert.ok(TIPOS_CLASIFICACION.includes('RECIBO_NOMINA'));
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

test('el formulario ya no pide la moto: la captura el vendedor', () => {
  for (const campo of ['modelo', 'color', 'anio', 'plazo', 'subesquema']) {
    assert.ok(!(campo in FORMULARIO.esquema.properties), `${campo} sobra`);
  }
});
