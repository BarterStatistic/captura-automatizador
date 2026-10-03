// Sueldo, frecuencia y día de pago salen de los depósitos de nómina que Gemini
// lista. La aritmética es nuestra, para que dé lo mismo cada vez.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analizarNomina, frecuenciaPorDias } from '../src/lib/nomina.js';

const quincenas = [
  { fecha: '2026-08-15', monto: 7500, concepto: 'PAGO NOMINA' },
  { fecha: '2026-08-31', monto: 7500, concepto: 'PAGO NOMINA' },
  { fecha: '2026-09-15', monto: 7520.5, concepto: 'PAGO NOMINA' },
  { fecha: '2026-09-30', monto: 7500, concepto: 'PAGO NOMINA' },
];

test('depósitos cada 15 días son quincenales y el sueldo es el doble del depósito', () => {
  const r = analizarNomina(quincenas);

  assert.equal(r.frecuencia, 'QUINCENAL');
  assert.equal(r.sueldoMensual, 15000);
  assert.equal(r.diaPago, '');
  assert.equal(r.depositos, 4);
});

test('depósitos cada viernes son semanales, por 4, y el día de pago es VIERNES', () => {
  const viernes = ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25'].map((fecha) => ({
    fecha,
    monto: '$2,800.00',
  }));
  const r = analizarNomina(viernes);

  assert.equal(r.frecuencia, 'SEMANAL');
  assert.equal(r.sueldoMensual, 11200);
  assert.equal(r.diaPago, 'VIERNES');
});

test('un depósito al mes es mensual', () => {
  const r = analizarNomina([
    { fecha: '2026-07-30', monto: 18000 },
    { fecha: '2026-08-30', monto: 18000 },
  ]);

  assert.equal(r.frecuencia, 'MENSUAL');
  assert.equal(r.sueldoMensual, 18000);
});

test('un aguinaldo o bono no infla el sueldo: se usa el monto típico', () => {
  const r = analizarNomina([...quincenas, { fecha: '2026-09-20', monto: 30000 }]);

  assert.equal(r.sueldoMensual, 15000);
});

test('los depósitos repetidos de dos estados de cuenta se cuentan una vez', () => {
  const r = analizarNomina([...quincenas, ...quincenas]);

  assert.equal(r.depositos, 4);
  assert.equal(r.frecuencia, 'QUINCENAL');
});

test('con un solo depósito no se sabe la frecuencia', () => {
  assert.equal(analizarNomina([{ fecha: '2026-09-15', monto: 7500 }]), null);
  assert.equal(analizarNomina([]), null);
  assert.equal(analizarNomina(null), null);
});

test('los cortes de días entre pagos', () => {
  assert.equal(frecuenciaPorDias(7), 'SEMANAL');
  assert.equal(frecuenciaPorDias(14), 'QUINCENAL');
  assert.equal(frecuenciaPorDias(16), 'QUINCENAL');
  assert.equal(frecuenciaPorDias(30), 'MENSUAL');
});
