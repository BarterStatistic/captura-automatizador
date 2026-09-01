// Datos ficticios. La CURP es válida (su dígito verificador cuadra) y el RFC
// esperado es el que produce el algoritmo del SAT sobre ella.
//
// El mismo cálculo se cotejó el 2026-08-31 contra un expediente real: el RFC
// que Dinamo tenía registrado coincidió con el calculado. Ese expediente no se
// guarda aquí porque este repositorio es público.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolverRfc, curpValida } from '../src/lib/rfc.js';

test('el RFC sale de las diez primeras posiciones de la CURP', () => {
  const { rfc } = resolverRfc(
    'JUAN',
    'PEREZ',
    'GOMEZ',
    '1990-01-15',
    'PEGJ900115HCLRMN08',
  );

  assert.equal(rfc, 'PEGJ9001152E5');
});

test('cuando hay CURP, el origen es la CURP y no hay discrepancia', () => {
  const { origen, advertencia } = resolverRfc(
    'JUAN',
    'PEREZ',
    'GOMEZ',
    '1990-01-15',
    'PEGJ900115HCLRMN08',
  );

  assert.equal(origen, 'curp');
  assert.equal(advertencia, null);
});

test('una CURP con dígito verificador correcto se acepta', () => {
  assert.equal(curpValida('PEGJ900115HCLRMN08'), true);
});

test('una CURP con un carácter alterado se rechaza', () => {
  // Misma CURP con la última posición cambiada: el dígito ya no cuadra.
  assert.equal(curpValida('PEGJ900115HCLRMN09'), false);
});
