// Normalización de lo que traen los documentos al formato exacto que aceptan
// los campos de Dinamo. Todos los casos salen del expediente de ejemplo del
// 2026-08-31 o de los maxlength del HTML real.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  partirTelefono,
  partirAntiguedad,
  razonSocial,
  partirCalle,
} from '../src/lib/normaliza.js';

// --- Teléfonos ----------------------------------------------------------------
// txtlada tiene maxlength=3 y txttelefono maxlength=7: siempre 3 + 7.

test('un número de Saltillo se parte en lada de 3 y teléfono de 7', () => {
  assert.deepEqual(partirTelefono('+52 844 123 4567'), {
    lada: '844',
    telefono: '1234567',
  });
});

test('un número de CDMX también se parte 3 y 7, aunque su lada sea de 2', () => {
  // 55 1234 5678 no cabe como lada 55 + 8 dígitos. Se parte 3+7 porque
  // concatenados dan el número correcto, que es lo que importa al marcar.
  assert.deepEqual(partirTelefono('+52 55 1234 5678'), {
    lada: '551',
    telefono: '2345678',
  });
});

test('el número se limpia de espacios, guiones y paréntesis', () => {
  assert.deepEqual(partirTelefono('(844) 123-4567'), {
    lada: '844',
    telefono: '1234567',
  });
});

test('un número que no tiene 10 dígitos se rechaza', () => {
  assert.equal(partirTelefono('844 123 45'), null);
});

// --- Antigüedades -------------------------------------------------------------
// txtant_anios_emp lleva años; cboant_meses_emp lleva los meses sueltos.

test('«6 meses» son cero años y seis meses', () => {
  assert.deepEqual(partirAntiguedad('6 meses'), { anios: 0, meses: 6 });
});

test('«6 años aprox» son seis años, ignorando el aproximado', () => {
  assert.deepEqual(partirAntiguedad('6 años aprox'), { anios: 6, meses: 0 });
});

test('«2 años 3 meses» reparte ambas unidades', () => {
  assert.deepEqual(partirAntiguedad('2 años 3 meses'), { anios: 2, meses: 3 });
});

test('«año y medio» se redondea hacia abajo a un año', () => {
  assert.deepEqual(partirAntiguedad('año y medio'), { anios: 1, meses: 0 });
});

test('un texto sin cifras no da antigüedad', () => {
  assert.equal(partirAntiguedad('bastante tiempo'), null);
});

// --- Razón social -------------------------------------------------------------
// La INE imprime paterno, materno y nombres; el SAT los quiere al revés.

test('la razón social pone los nombres antes que los apellidos', () => {
  assert.equal(razonSocial('JUAN', 'PEREZ', 'GOMEZ'), 'JUAN PEREZ GOMEZ');
});

test('sin apellido materno la razón social no deja doble espacio', () => {
  assert.equal(razonSocial('JUAN', 'PEREZ', null), 'JUAN PEREZ');
});

// --- Calle y números ----------------------------------------------------------

test('la INE trae el interior pegado al exterior', () => {
  assert.deepEqual(partirCalle('C JUAREZ 300 2'), {
    calle: 'JUAREZ',
    numeroExterior: '300',
    numeroInterior: '2',
  });
});

test('lo que sigue al exterior y no es un número se descarta', () => {
  // «MORELOS 245 FRAC3»: calle MORELOS y exterior 245, sin interior. FRAC3 no
  // es un número de interior, así que se descarta.
  assert.deepEqual(partirCalle('MORELOS 245 FRAC3'), {
    calle: 'MORELOS',
    numeroExterior: '245',
    numeroInterior: '',
  });
});

test('una calle sin número deja los números vacíos', () => {
  assert.deepEqual(partirCalle('PRIVADA LOS OLIVOS'), {
    calle: 'PRIVADA LOS OLIVOS',
    numeroExterior: '',
    numeroInterior: '',
  });
});

test('la abreviatura CALLE se quita del principio', () => {
  assert.deepEqual(partirCalle('CALLE 8 DE MAYO 22'), {
    calle: '8 DE MAYO',
    numeroExterior: '22',
    numeroInterior: '',
  });
});
