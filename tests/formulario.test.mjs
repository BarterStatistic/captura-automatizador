// Lo que el formulario del vendedor trae además de los siete puntos pasa a la
// captura manual, sin pisar nunca lo que el capturista ya eligió.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extrasAlManual, opcionPorNombre } from '../src/lib/formulario.js';
import { ESQUEMAS_VENTA, SUBESQUEMAS } from '../src/lib/esquemas.js';

const VACIO = { celular: '', esquemaVenta: '', referencias: {} };

test('MOTOXPRESS FLEX no se confunde con MOTOXPRESS', () => {
  assert.equal(opcionPorNombre(ESQUEMAS_VENTA, 'Motoxpress flex')?.value, '51');
  assert.equal(opcionPorNombre(ESQUEMAS_VENTA, 'MOTOXPRESS')?.value, '15');
  assert.equal(opcionPorNombre(ESQUEMAS_VENTA, 'esquema credinamo')?.value, '1');
});

test('los acentos y las abreviaturas no impiden encontrar el subesquema', () => {
  assert.equal(opcionPorNombre(SUBESQUEMAS, 'jubilados')?.value, '9');
  assert.equal(opcionPorNombre(SUBESQUEMAS, 'Dueño de negocio esq. 50')?.value, '14');
});

test('un nombre ambiguo o desconocido no elige nada', () => {
  assert.equal(opcionPorNombre(SUBESQUEMAS, 'BURÓCRATAS'), null);
  assert.equal(opcionPorNombre(ESQUEMAS_VENTA, 'contado'), null);
  assert.equal(opcionPorNombre(ESQUEMAS_VENTA, null), null);
});

test('los huecos se llenan con lo que trae el formulario', () => {
  const nuevo = extrasAlManual(VACIO, {
    celular: '844 555 6677',
    esquema: 'MOTOXPRESS',
    modelo: 'DM 150',
  });

  assert.equal(nuevo.celular, '844 555 6677');
  assert.equal(nuevo.esquemaVenta, '15');
  assert.equal(nuevo.modelo, undefined, 'la moto la captura el vendedor en Dinamo');
});

test('lo que el capturista ya eligió no se sobrescribe', () => {
  const elegido = { ...VACIO, celular: '8440000000', esquemaVenta: '1' };
  const nuevo = extrasAlManual(elegido, { celular: '8441111111', esquema: 'MOTOXPRESS' });

  assert.equal(nuevo.celular, '8440000000');
  assert.equal(nuevo.esquemaVenta, '1');
});

test('las referencias extra van a la 2 y la 3', () => {
  const nuevo = extrasAlManual(VACIO, {
    referencias_extra: [
      { nombre: 'Ana Lopez', telefono: '8441234567' },
      { nombre: 'Pedro Ruiz', telefono: '8447654321' },
      { nombre: 'Sobra', telefono: '0' },
    ],
  });

  assert.deepEqual(nuevo.referencias.ref_b, { nombreCompleto: 'Ana Lopez', telefono: '8441234567' });
  assert.deepEqual(nuevo.referencias.ref_c, { nombreCompleto: 'Pedro Ruiz', telefono: '8447654321' });
  assert.equal(Object.keys(nuevo.referencias).length, 2);
});

test('una lectura vacía deja la captura igual', () => {
  assert.equal(extrasAlManual(VACIO, null), VACIO);
});
