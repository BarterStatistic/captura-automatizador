// El catálogo de motos del campo Modelo y cómo se reconoce lo que escribe el
// vendedor. La extensión busca el modelo en Dinamo por este nombre.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODELOS, MODELOS_ORDENADOS, modeloPorNombre } from '../src/lib/motos.js';

test('el catálogo trae los 37 modelos de la lista vigente, sin repetidos', () => {
  assert.equal(MODELOS.length, 37);
  assert.equal(new Set(MODELOS).size, MODELOS.length);
});

test('el menú los muestra en orden alfabético', () => {
  assert.equal(MODELOS_ORDENADOS.length, MODELOS.length);
  assert.equal(MODELOS_ORDENADOS[0], 'ADVENTURE ELITE');
});

test('se reconoce el modelo aunque venga en minúsculas o con otros signos', () => {
  assert.equal(modeloPorNombre('heavy cab 300'), 'HEAVY CAB 300');
  assert.equal(modeloPorNombre('Kf racer'), 'KF-RACER');
});

test('gana el nombre más largo: U5 175 no se confunde con U5', () => {
  assert.equal(modeloPorNombre('quiere la U5 175 negra'), 'U5 175');
  assert.equal(modeloPorNombre('U5'), 'U5');
});

test('un modelo que no está en el catálogo no se inventa', () => {
  assert.equal(modeloPorNombre('Italika FT150'), null);
  assert.equal(modeloPorNombre(''), null);
});
