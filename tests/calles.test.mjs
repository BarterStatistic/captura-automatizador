// Generador del domicilio de las referencias. Es dato ficticio a propósito
// (decisión del usuario del 2026-08-31), así que lo importante es que salga de
// calles que existen de verdad y que sea reproducible al revisarlo.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CALLES, CIUDADES, generarDomicilio } from '../src/lib/calles.js';

test('las calles están agrupadas por las tres ciudades de la zona', () => {
  assert.deepEqual(CIUDADES, ['SALTILLO', 'RAMOS ARIZPE', 'ARTEAGA']);
});

test('cada ciudad aporta calles', () => {
  for (const ciudad of CIUDADES) {
    assert.ok(CALLES[ciudad].length >= 5, `${ciudad} necesita varias calles`);
  }
});

test('el domicilio generado usa una calle que existe', () => {
  const domicilio = generarDomicilio('SALTILLO', 1);

  assert.ok(CALLES.SALTILLO.includes(domicilio.calle));
});

test('el número exterior es plausible', () => {
  const { numeroExterior } = generarDomicilio('SALTILLO', 7);
  const numero = Number(numeroExterior);

  assert.ok(numero >= 100 && numero <= 9999, `${numero} no parece número de casa`);
});

test('la misma semilla da siempre el mismo domicilio', () => {
  assert.deepEqual(generarDomicilio('ARTEAGA', 42), generarDomicilio('ARTEAGA', 42));
});

test('semillas distintas dan domicilios distintos', () => {
  const uno = generarDomicilio('SALTILLO', 1);
  const dos = generarDomicilio('SALTILLO', 2);

  assert.notDeepEqual(uno, dos);
});

test('el domicilio queda marcado como ficticio', () => {
  assert.equal(generarDomicilio('RAMOS ARIZPE', 3).ficticio, true);
});

test('una ciudad desconocida cae en Saltillo', () => {
  const domicilio = generarDomicilio('MONTERREY', 5);

  assert.ok(CALLES.SALTILLO.includes(domicilio.calle));
});
