// Lo que se escribe en la solicitud de crédito impresa. Sale del mismo
// expediente que llena Dinamo; lo que no se sabe se deja en blanco.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { armarExpediente } from '../src/lib/expediente.js';
import {
  antiguedadLegible,
  datosSolicitud,
  fechaLegible,
  pesosLegibles,
  sexoDelFormato,
  telefonoLegible,
} from '../src/lib/solicitud.js';

// Datos ficticios, con la forma que devuelve Gemini.
const LECTURAS = {
  ineFrente: {
    nombres: 'Juan',
    apellido_paterno: 'Perez',
    apellido_materno: 'Gomez',
    curp: 'PEGJ900115HCLRMN08',
    fecha_nacimiento: '1990-01-15',
    sexo: 'H',
    estado: 'COAH',
  },
  ineAtras: { ocr: '1234567890123' },
  comprobante: {
    calle: 'MORELOS 245 3',
    colonia: 'zona centro',
    cp: '25000',
    municipio: 'Saltillo',
    estado: 'Coahuila',
  },
  ingresos: { tipo_comprobante: 'RECIBO_NOMINA', monto_recibo: 4250, frecuencia_pago: 'SEMANAL' },
  formulario: {
    correo: 'Ejemplo25@gmail.com',
    empleo: 'Tornillos del Norte',
    direccion_empleo: 'Industria 120',
    colonia_empleo: 'Industrial',
    antiguedad_laboral: '2 años y medio',
    companero_nombre: 'Ana Martinez',
    companero_telefono: '844 222 3344',
    antiguedad_domicilio: '6 años',
    referencia_nombre: 'Luis Perez Soto',
    referencia_telefono: '+52 844 123 4567',
  },
};

const MANUAL = {
  celular: '8445556677',
  esquemaVenta: '1',
  ciudadReferencias: 'SALTILLO',
  referencias: { ref: { calle: 'ALLENDE', numeroExterior: '210' } },
};

const HOY = new Date(2026, 9, 6);

function solicitud(impresion = {}, lecturas = LECTURAS, manual = MANUAL) {
  const { datos } = armarExpediente(lecturas, manual);
  return datosSolicitud({ datos, lecturas, manual, impresion, hoy: HOY });
}

test('los datos personales salen de la INE, en mayúsculas', () => {
  const { personal } = solicitud();

  assert.equal(personal.nombres, 'JUAN');
  assert.equal(personal.apellidoPaterno, 'PEREZ');
  assert.equal(personal.apellidoMaterno, 'GOMEZ');
  assert.equal(personal.fechaNacimiento, '15/01/1990');
  assert.equal(personal.nacionalidad, 'MEXICANA');
  assert.equal(personal.rfc, 'PEGJ9001152E5');
  assert.equal(personal.correo, 'ejemplo25@gmail.com');
});

test('la H de la INE es la M de masculino del formato, y la M de la INE es F', () => {
  assert.equal(sexoDelFormato('H'), 'M');
  assert.equal(sexoDelFormato('M'), 'F');
  assert.equal(sexoDelFormato('mujer'), 'F');
  assert.equal(sexoDelFormato(''), '');
  assert.equal(solicitud().personal.sexo, 'M');
});

test('el domicilio sale del comprobante, con el estado del comprobante', () => {
  const { domicilio } = solicitud();

  assert.equal(domicilio.calle, 'MORELOS');
  assert.equal(domicilio.numeroExterior, '245');
  assert.equal(domicilio.numeroInterior, '3');
  assert.equal(domicilio.colonia, 'ZONA CENTRO');
  // El comprobante no dice la ciudad: se deja para llenarla a mano.
  assert.equal(domicilio.ciudad, '');
  assert.equal(domicilio.municipio, 'SALTILLO');
  assert.equal(domicilio.estado, 'COAHUILA');
  assert.equal(domicilio.antiguedad, '6 AÑOS');
  assert.equal(domicilio.celular, '844 555 6677');
});

test('sin estado en el comprobante el estado queda vacío (no se toma de la INE)', () => {
  const lecturas = { ...LECTURAS, comprobante: { ...LECTURAS.comprobante, estado: null } };
  assert.equal(solicitud({}, lecturas).domicilio.estado, '');
});

test('el jefe inmediato es siempre la referencia laboral y el sueldo es el de Dinamo', () => {
  const { empleo } = solicitud();

  assert.equal(empleo.empresa, 'TORNILLOS DEL NORTE');
  assert.equal(empleo.calle, 'INDUSTRIA');
  assert.equal(empleo.numeroExterior, '120');
  assert.equal(empleo.antiguedad, '2 AÑOS 6 MESES');
  assert.equal(empleo.jefe, 'ANA MARTINEZ');
  // El teléfono de la empresa no se sabe.
  assert.equal(empleo.telefono, undefined);
  assert.equal(empleo.frecuenciaPago, 'SEMANAL');
  assert.equal(empleo.ingreso, '$4,250');
  // Del recibo de nómina no se sabe si le pagan por banco.
  assert.equal(empleo.formaPago, '');
});

test('con depósitos de nómina en el estado de cuenta, la forma de pago es electrónica', () => {
  const lecturas = {
    ...LECTURAS,
    ingresos: {
      tipo_comprobante: 'ESTADO_CUENTA',
      frecuencia_pago: 'QUINCENAL',
      depositos_nomina: [
        { fecha: '2026-09-15', monto: 6000, concepto: 'NOMINA' },
        { fecha: '2026-09-30', monto: 6000, concepto: 'NOMINA' },
      ],
    },
  };
  assert.equal(solicitud({}, lecturas).empleo.formaPago, 'ELECTRONICO');
});

test('las referencias llevan nombre y teléfono; el domicilio generado no se imprime', () => {
  const { referencias } = solicitud();

  assert.equal(referencias.length, 1);
  assert.deepEqual(referencias[0], {
    nombre: 'LUIS PEREZ SOTO',
    domicilio: '',
    telefono: '844 123 4567',
  });
});

test('MOTOXPRESS imprime las tres referencias', () => {
  const manual = {
    ...MANUAL,
    esquemaVenta: '15',
    referencias: {
      ref: { calle: 'ALLENDE', numeroExterior: '210' },
      ref_b: { nombreCompleto: 'Rosa Diaz', telefono: '8440001122', calle: 'HIDALGO', numeroExterior: '15' },
      ref_c: { nombreCompleto: 'Pedro Luna Mata', telefono: '8443334455' },
    },
  };
  const { referencias } = solicitud({}, LECTURAS, manual);

  assert.equal(referencias.length, 3);
  assert.equal(referencias[1].nombre, 'ROSA DIAZ');
  assert.equal(referencias[2].domicilio, '');
});

test('la moto y el dinero se escriben solo si el capturista los da', () => {
  const vacia = solicitud();
  assert.equal(vacia.venta.motocicleta, '');
  assert.equal(vacia.venta.importe, '');
  assert.equal(vacia.venta.montoFinanciado, '');
  assert.equal(vacia.venta.agencia, 'SALTILLO');
  // El tipo de persona no se marca nunca.
  assert.equal(vacia.tipoPersona, undefined);

  const llena = solicitud({ motocicleta: 'dm 200', importe: '45990', enganche: '5,000', plazo: '52 semanas' });
  assert.equal(llena.venta.motocicleta, 'DM 200');
  assert.equal(llena.venta.importe, '$45,990');
  assert.equal(llena.venta.enganche, '$5,000');
  // Sin escribirlo, el monto financiado es el importe menos el enganche.
  assert.equal(llena.venta.montoFinanciado, '$40,990');
  assert.equal(llena.venta.plazo, '52 SEMANAS');

  const aMano = solicitud({ importe: '45990', enganche: '5000', montoFinanciado: '41500' });
  assert.equal(aMano.venta.montoFinanciado, '$41,500');
});

test('la fecha de la solicitud es la de hoy, en tres casillas', () => {
  assert.deepEqual(solicitud().fecha, { dia: '06', mes: '10', anio: '2026' });
});

test('sin documentos no se inventa nada', () => {
  const vacia = datosSolicitud({ datos: armarExpediente({}, {}).datos, hoy: HOY });

  assert.equal(vacia.personal.nombres, '');
  assert.equal(vacia.personal.nacionalidad, '');
  assert.equal(vacia.personal.correo, '');
  assert.equal(vacia.domicilio.antiguedad, '');
  assert.equal(vacia.empleo.ingreso, '');
});

test('formatos sueltos', () => {
  assert.equal(telefonoLegible('+52 844 123 4567'), '844 123 4567');
  assert.equal(telefonoLegible('12345'), '12345');
  assert.equal(fechaLegible('2001-12-31'), '31/12/2001');
  assert.equal(fechaLegible('31/12/2001'), '');
  assert.equal(pesosLegibles(''), '');
  assert.equal(pesosLegibles('$12,500.50'), '$12,500.5');
  assert.equal(antiguedadLegible(1, 1), '1 AÑO 1 MES');
  assert.equal(antiguedadLegible(0, 0), '');
});
