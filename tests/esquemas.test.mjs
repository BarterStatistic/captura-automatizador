// Catálogos de la pantalla de tipo de venta y la regla que decide cuántas
// referencias hay que capturar. Los value salen del HTML real de Dinamo.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ESQUEMAS_VENTA,
  referenciasRequeridas,
  esquemaPorValue,
  TIPOS_VENTA,
  TIPOS_UNIDAD,
  SUBESQUEMAS,
  TIPOS_CREDITO,
} from '../src/lib/esquemas.js';

const local = (valor) => JSON.parse(JSON.stringify(valor));

test('al empezar se ofrecen los seis tipos de crédito del equipo', () => {
  assert.deepEqual(
    TIPOS_CREDITO.map((tipo) => tipo.nombre),
    ['MOTONOMINA', 'MOTONOMINA FLEX', 'CREDINAMO', 'CREDINAMO FLEX', 'MOTOXPRESS', 'MOTOXPRESS FLEX'],
  );
});

test('cada tipo de crédito usa el value real de Dinamo', () => {
  for (const tipo of TIPOS_CREDITO) {
    assert.equal(esquemaPorValue(tipo.value), tipo);
  }
});

test('CREDINAMO solo pide la referencia 1', () => {
  assert.deepEqual(referenciasRequeridas('1'), ['ref']);
});

test('MOTOXPRESS pide tres referencias', () => {
  assert.deepEqual(referenciasRequeridas('15'), ['ref', 'ref_b', 'ref_c']);
});

test('MOTOXPRESS FLEX también pide tres referencias', () => {
  assert.deepEqual(referenciasRequeridas('51'), ['ref', 'ref_b', 'ref_c']);
});

test('un esquema desconocido cae en el mínimo de una referencia', () => {
  assert.deepEqual(referenciasRequeridas('999'), ['ref']);
});

test('los value del catálogo son los del HTML de Dinamo', () => {
  assert.equal(esquemaPorValue('1').nombre, 'CREDINAMO');
  assert.equal(esquemaPorValue('53').nombre, 'CREDINAMO FLEX');
  assert.equal(esquemaPorValue('19').nombre, 'DINAMO NOMINA');
  assert.equal(esquemaPorValue('2').nombre, 'MOTONOMINA');
  assert.equal(esquemaPorValue('15').nombre, 'MOTOXPRESS');
  assert.equal(esquemaPorValue('51').nombre, 'MOTOXPRESS FLEX');
});

test('el catálogo tiene los siete esquemas del formulario', () => {
  assert.equal(ESQUEMAS_VENTA.length, 7);
});

// --- Catálogos de la pantalla de tipo de venta -------------------------------
// Los value salen del HTML real; equivocarse aquí captura un crédito distinto
// al que se vendió.

test('tipo de venta y tipo de unidad son los del formulario', () => {
  assert.deepEqual(TIPOS_VENTA, [
    { value: '1', nombre: 'CREDITO' },
    { value: '2', nombre: 'CONTADO' },
  ]);
  assert.deepEqual(TIPOS_UNIDAD, [
    { value: '1', nombre: 'NUEVA' },
    { value: '2', nombre: 'SEMINUEVA' },
  ]);
});

test('los subesquemas incluyen los nueve del catálogo', () => {
  assert.equal(SUBESQUEMAS.length, 9);
  assert.equal(SUBESQUEMAS.find((s) => s.value === '10').nombre, 'ASALARIADO');
  assert.equal(SUBESQUEMAS.find((s) => s.value === '29').nombre, 'BURÓCRATAS FEDERAL');
});
