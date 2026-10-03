// Generador del domicilio de las referencias. Es dato ficticio a propósito
// (decisión del usuario del 2026-08-31): lo importante es que salga de calles
// que existen y que no se repita, ni entre las referencias de un cliente ni
// entre clientes seguidos.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CALLES,
  CIUDADES,
  anotarCalles,
  callesRecientes,
  generarDomicilio,
  generarDomicilios,
} from '../src/lib/calles.js';

/** Un azar fijo, para que las pruebas den siempre lo mismo. */
function azarFijo(semilla = 1) {
  let x = semilla;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

test('las calles están agrupadas por las tres ciudades de la zona', () => {
  assert.deepEqual(CIUDADES, ['SALTILLO', 'RAMOS ARIZPE', 'ARTEAGA']);
});

test('cada ciudad aporta muchas calles, sin repetidas', () => {
  for (const ciudad of CIUDADES) {
    assert.ok(CALLES[ciudad].length >= 15, `${ciudad} necesita más calles`);
    assert.equal(new Set(CALLES[ciudad]).size, CALLES[ciudad].length, `${ciudad} repite calles`);
  }
});

test('el domicilio generado usa una calle que existe y un número plausible', () => {
  const domicilio = generarDomicilio('SALTILLO', { aleatorio: azarFijo(3) });
  const numero = Number(domicilio.numeroExterior);

  assert.ok(CALLES.SALTILLO.includes(domicilio.calle));
  assert.ok(numero >= 100 && numero <= 3999, `${numero} no parece número de casa`);
  assert.equal(domicilio.ficticio, true);
});

test('generar otra vez da otro domicilio', () => {
  const vistos = new Set();
  for (let i = 0; i < 20; i += 1) {
    const { calle, numeroExterior } = generarDomicilio('SALTILLO');
    vistos.add(`${calle} ${numeroExterior}`);
  }
  assert.ok(vistos.size >= 18, `solo salieron ${vistos.size} domicilios distintos de 20`);
});

test('las referencias de un mismo cliente nunca comparten calle', () => {
  for (let semilla = 1; semilla <= 50; semilla += 1) {
    for (const ciudad of CIUDADES) {
      const calles = generarDomicilios(ciudad, 3, { aleatorio: azarFijo(semilla) }).map((d) => d.calle);
      assert.equal(new Set(calles).size, 3, `${ciudad}: ${calles.join(', ')}`);
    }
  }
});

test('se evitan las calles usadas hace poco', () => {
  const recientes = CALLES.ARTEAGA.slice(0, -3);
  const calles = generarDomicilios('ARTEAGA', 3, { evitar: recientes }).map((d) => d.calle);

  assert.deepEqual([...calles].sort(), CALLES.ARTEAGA.slice(-3).sort());
});

test('si todas las calles son recientes, igual se genera sin repetir dentro del cliente', () => {
  const calles = generarDomicilios('ARTEAGA', 3, { evitar: CALLES.ARTEAGA }).map((d) => d.calle);

  assert.equal(new Set(calles).size, 3);
});

test('una ciudad desconocida cae en Saltillo', () => {
  const domicilio = generarDomicilio('MONTERREY');

  assert.ok(CALLES.SALTILLO.includes(domicilio.calle));
});

test('las calles recientes se recuerdan por ciudad y sin pasarse del límite', () => {
  const memoria = new Map();
  globalThis.localStorage = {
    getItem: (clave) => memoria.get(clave) ?? null,
    setItem: (clave, valor) => memoria.set(clave, valor),
  };
  try {
    anotarCalles('ARTEAGA', CALLES.ARTEAGA);
    anotarCalles('SALTILLO', ['ALLENDE']);

    assert.equal(callesRecientes('ARTEAGA').length, CALLES.ARTEAGA.length - 3);
    assert.deepEqual(callesRecientes('SALTILLO'), ['ALLENDE']);
    assert.deepEqual(callesRecientes('RAMOS ARIZPE'), []);
  } finally {
    delete globalThis.localStorage;
  }
});

test('sin almacenamiento disponible no truena', () => {
  assert.deepEqual(callesRecientes('SALTILLO'), []);
  anotarCalles('SALTILLO', ['ALLENDE']);
});
