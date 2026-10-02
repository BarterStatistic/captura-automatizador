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
  modelo: 'U5',
  anio: '2026',
  plazo: '24',
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

// --- Estados de cuenta --------------------------------------------------------
// La app guarda cada estado de cuenta en su casilla (estadoCuenta1 y 2). Antes
// el expediente solo leía `estadosCuenta`, así que el sueldo nunca llegaba.

const { estadosCuenta: _combinado, ...SIN_COMBINAR } = LECTURAS;

test('el sueldo sale del estado de cuenta de la casilla 1', () => {
  const lecturas = {
    ...SIN_COMBINAR,
    estadoCuenta1: { sueldo_mensual: 15000, frecuencia_pago: 'QUINCENAL' },
  };
  const { datos } = armarExpediente(lecturas, MANUAL);

  assert.equal(datos.empleo.sueldo, 15000);
  assert.equal(datos.empleo.frecuenciaPago, 'QUINCENAL');
});

test('si el primer estado no trae sueldo, se usa el segundo', () => {
  const lecturas = {
    ...SIN_COMBINAR,
    estadoCuenta1: { sueldo_mensual: null, frecuencia_pago: null },
    estadoCuenta2: { sueldo_mensual: 12000, frecuencia_pago: 'SEMANAL' },
  };
  const { datos } = armarExpediente(lecturas, MANUAL);

  assert.equal(datos.empleo.sueldo, 12000);
  assert.equal(datos.empleo.frecuenciaPago, 'SEMANAL');
});

test('dos sueldos muy distintos se avisan y manda el primero', () => {
  const lecturas = {
    ...SIN_COMBINAR,
    estadoCuenta1: { sueldo_mensual: 15000, frecuencia_pago: 'QUINCENAL' },
    estadoCuenta2: { sueldo_mensual: 30000, frecuencia_pago: 'QUINCENAL' },
  };
  const { datos, avisos } = armarExpediente(lecturas, MANUAL);

  assert.equal(datos.empleo.sueldo, 15000);
  assert.ok(avisos.some((aviso) => aviso.campo === 'sueldo'));
});

test('un sueldo corregido a mano con signo y comas se entiende', () => {
  const lecturas = { ...SIN_COMBINAR, estadoCuenta1: { sueldo_mensual: '$15,500' } };
  const { datos } = armarExpediente(lecturas, MANUAL);

  assert.equal(datos.empleo.sueldo, 15500);
});

// --- Tipo de crédito ----------------------------------------------------------
// Se elige al empezar cada captura; sin él el expediente no se puede llenar.

test('sin tipo de crédito el expediente no arranca', () => {
  const { faltantes } = armarExpediente(LECTURAS, { ...MANUAL, esquemaVenta: '' });

  assert.ok(faltantes.includes('tipoCredito'));
});

test('con tipo de crédito elegido no falta', () => {
  const { faltantes } = armarExpediente(LECTURAS, MANUAL);

  assert.ok(!faltantes.includes('tipoCredito'));
});

test('si el formulario dice otro tipo, gana lo elegido y se avisa', () => {
  const lecturas = { ...LECTURAS, formulario: { ...LECTURAS.formulario, esquema: 'Motoxpress' } };
  const { datos, avisos } = armarExpediente(lecturas, { ...MANUAL, esquemaVenta: '1' });

  assert.ok(avisos.some((aviso) => aviso.campo === 'tipoCredito'));
  assert.deepEqual(Object.keys(datos.referencias), ['ref']);
});

test('si el formulario coincide con lo elegido no hay aviso', () => {
  const lecturas = { ...LECTURAS, formulario: { ...LECTURAS.formulario, esquema: 'CREDINAMO' } };
  const { avisos } = armarExpediente(lecturas, { ...MANUAL, esquemaVenta: '1' });

  assert.ok(!avisos.some((aviso) => aviso.campo === 'tipoCredito'));
});

// --- Domicilio en campos separados ----------------------------------------------
// Dinamo pide calle, número exterior y número interior por separado.

test('la línea del recibo se parte en calle, exterior e interior', () => {
  const lecturas = { ...LECTURAS, comprobante: { ...LECTURAS.comprobante, calle: 'C JUAREZ 300 2' } };
  const { datos } = armarExpediente(lecturas, MANUAL);

  assert.equal(datos.domicilio.calle, 'JUAREZ');
  assert.equal(datos.domicilio.numeroExterior, '300');
  assert.equal(datos.domicilio.numeroInterior, '2');
});

test('lo corregido a mano en cada campo manda sobre la línea del recibo', () => {
  const lecturas = {
    ...LECTURAS,
    comprobante: {
      ...LECTURAS.comprobante,
      calle: 'MORELOS 245 FRAC3',
      calle_nombre: 'MORELOS PONIENTE',
      numero_exterior: '245-A',
      numero_interior: '',
    },
  };
  const { datos } = armarExpediente(lecturas, MANUAL);

  assert.equal(datos.domicilio.calle, 'MORELOS PONIENTE');
  assert.equal(datos.domicilio.numeroExterior, '245-A');
  assert.equal(datos.domicilio.numeroInterior, '');
});

test('sin número exterior el expediente no arranca', () => {
  const lecturas = { ...LECTURAS, comprobante: { ...LECTURAS.comprobante, calle: 'CERRADA DEL SOL' } };
  const { faltantes } = armarExpediente(lecturas, MANUAL);

  assert.ok(faltantes.includes('domicilio.numeroExterior'));
});

test('la antigüedad en el domicilio trae años y meses', () => {
  const lecturas = { ...LECTURAS, formulario: { ...LECTURAS.formulario, antiguedad_domicilio: '2 años 3 meses' } };
  const { datos } = armarExpediente(lecturas, MANUAL);

  assert.equal(datos.domicilio.antiguedadAnios, 2);
  assert.equal(datos.domicilio.antiguedadMeses, 3);
});

test('sin modelo, año y plazo el expediente no arranca', () => {
  const { faltantes } = armarExpediente(LECTURAS, { ...MANUAL, modelo: '', anio: '', plazo: '' });

  assert.ok(['modelo', 'anio', 'plazo'].every((campo) => faltantes.includes(campo)));
});
