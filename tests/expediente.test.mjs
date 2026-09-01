// Fusión de las seis lecturas en un solo expediente. Aquí viven las reglas de
// negocio que se decidieron con el usuario el 2026-08-31, y que no se deducen
// de ningún documento por sí solo.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { armarExpediente } from '../src/lib/expediente.js';

// Un expediente de ejemplo, con la misma forma que devuelve Gemini.
// Los datos son ficticios; las propiedades que se comprueban, no.
const LECTURAS = {
  ineFrente: {
    nombres: 'JUAN',
    apellido_paterno: 'PEREZ',
    apellido_materno: 'GOMEZ',
    curp: 'PEGJ900115HCLRMN08',
    fecha_nacimiento: '1990-01-15',
    sexo: 'H',
    calle: 'C JUAREZ 300 2',
    colonia: 'LA FRAGUA',
    cp: '25010',
  },
  ineAtras: { ocr: '1234567890123', curp: 'PEGJ900115HCLRMN08' },
  comprobante: {
    titular: 'MARTINEZ SOLIS, ROSA',
    rfc: 'XAXX010101000',
    calle: 'MORELOS 245 FRAC3',
    colonia: 'ZONA CENTRO',
    cp: '25000',
    municipio: 'SALTILLO',
  },
  estadosCuenta: { sueldo_mensual: 15000, frecuencia_pago: 'QUINCENAL' },
  formulario: {
    correo: 'ejemplo25@gmail.com',
    empleo: 'Tornillos del Norte',
    direccion_empleo: '5 de mayo colonia industrial',
    colonia_empleo: 'INDUSTRIAL',
    antiguedad_laboral: '6 meses',
    companero_nombre: 'Ana Martinez',
    companero_telefono: '+52 55 1234 5678',
    antiguedad_domicilio: '6 años aprox',
    referencia_nombre: 'Luis Perez',
    referencia_telefono: '+52 844 123 4567',
  },
};

const MANUAL = {
  celular: '844 555 6677',
  esquemaVenta: '1',
  referencias: { ref: { calle: 'ALLENDE', numeroExterior: '210' } },
};

test('el domicilio sale del comprobante, no de la INE', () => {
  const { datos } = armarExpediente(LECTURAS, MANUAL);

  assert.equal(datos.domicilio.calle, 'MORELOS');
  assert.equal(datos.domicilio.numeroExterior, '245');
  assert.equal(datos.domicilio.cp, '25000');
  assert.equal(datos.domicilio.colonia, 'ZONA CENTRO');
});

test('que el comprobante esté a nombre de otra persona no es un error', () => {
  const { faltantes, avisos } = armarExpediente(LECTURAS, MANUAL);

  assert.deepEqual(faltantes, []);
  assert.ok(
    !avisos.some((aviso) => /titular|nombre/i.test(aviso.mensaje)),
    'el titular distinto no debe generar un aviso',
  );
});

test('el RFC genérico del comprobante nunca se usa como RFC del cliente', () => {
  const { datos } = armarExpediente(LECTURAS, MANUAL);

  assert.notEqual(datos.cliente.rfc, 'XAXX010101000');
  assert.equal(datos.cliente.rfc, 'PEGJ9001152E5');
});

test('el idCIF sale del OCR del reverso de la INE', () => {
  const { datos } = armarExpediente(LECTURAS, MANUAL);

  assert.equal(datos.cliente.idCif, '1234567890123');
});

test('la antigüedad laboral se reparte en años y meses', () => {
  const { datos } = armarExpediente(LECTURAS, MANUAL);

  assert.equal(datos.empleo.antiguedadAnios, 0);
  assert.equal(datos.empleo.antiguedadMeses, 6);
});

test('el teléfono del compañero se parte para los campos del formulario', () => {
  const { datos } = armarExpediente(LECTURAS, MANUAL);

  assert.equal(datos.empleo.lada, '551');
  assert.equal(datos.empleo.telefono, '2345678');
});

test('sin CURP legible, el expediente no arranca', () => {
  const sinCurp = {
    ...LECTURAS,
    ineFrente: { ...LECTURAS.ineFrente, curp: null },
    ineAtras: { ...LECTURAS.ineAtras, curp: null },
  };

  const { faltantes } = armarExpediente(sinCurp, MANUAL);

  assert.ok(faltantes.includes('curp'), 'la CURP es obligatoria');
});

test('el número exterior del trabajo es opcional y no bloquea', () => {
  const { faltantes, datos } = armarExpediente(LECTURAS, MANUAL);

  assert.equal(datos.empleo.numeroExterior, '');
  assert.ok(!faltantes.includes('empleo.numeroExterior'));
});

test('cuando la CURP del frente y la del reverso difieren, se avisa', () => {
  const discrepante = {
    ...LECTURAS,
    ineAtras: { ...LECTURAS.ineAtras, curp: 'PEGJ900115HCLRMN99' },
  };

  const { avisos } = armarExpediente(discrepante, MANUAL);

  assert.ok(
    avisos.some((aviso) => /curp/i.test(aviso.mensaje)),
    'la discrepancia de CURP tiene que salir a la vista',
  );
});

test('el domicilio de la referencia se marca como generado', () => {
  const { datos } = armarExpediente(LECTURAS, MANUAL);

  assert.equal(datos.referencias.ref.calle, 'ALLENDE');
  assert.equal(datos.referencias.ref.domicilioFicticio, true);
});
