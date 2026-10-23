// El gasto de Gemini: costo por llamada, registro en Supabase y mes en curso.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inicioDeMes, registrarGasto, resumenDelMes, usoDeRespuesta } from '../api/_gasto.js';

const RESPUESTA = JSON.stringify({
  usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 300, thoughtsTokenCount: 700 },
});

test('el costo suma entrada y salida con razonamiento a precio de gemini-2.5-flash', () => {
  const uso = usoDeRespuesta(RESPUESTA, 'gemini-2.5-flash');
  // 2000 × 0.30 / 1M + (300 + 700) × 2.50 / 1M = 0.0006 + 0.0025
  assert.equal(uso.costo_usd, 0.0031);
  assert.equal(uso.tokens_razonamiento, 700);
});

test('sin usageMetadata o con JSON roto no hay costo', () => {
  assert.equal(usoDeRespuesta('{"candidates":[]}', 'gemini-2.5-flash'), null);
  assert.equal(usoDeRespuesta('no es json', 'gemini-2.5-flash'), null);
});

test('registrarGasto guarda la fila y devuelve el costo', async () => {
  const llamadas = [];
  const traer = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return { ok: true, status: 201, text: async () => '' };
  };
  const costo = await registrarGasto(
    { estado: 200, texto: RESPUESTA },
    { usuario: 'Bryan Barboza', captura: 'c-1', modelo: '' },
    { SUPABASE_SERVICE_KEY: 'llave', SUPABASE_URL: 'https://x.supabase.co' },
    traer,
  );

  assert.equal(costo, 0.0031);
  assert.match(llamadas[0].url, /\/rest\/v1\/gemini_uso$/);
  assert.equal(llamadas[0].opciones.headers.apikey, 'llave');
  const fila = JSON.parse(llamadas[0].opciones.body);
  assert.equal(fila.usuario, 'Bryan Barboza');
  assert.equal(fila.captura_id, 'c-1');
  assert.equal(fila.modelo, 'gemini-2.5-flash');
});

test('si Supabase falla o no hay llave, no se rompe y el costo igual se devuelve', async () => {
  const cae = async () => {
    throw new Error('sin red');
  };
  const silencio = console.error;
  const aviso = console.warn;
  console.error = console.warn = () => {};
  try {
    assert.equal(await registrarGasto({ estado: 200, texto: RESPUESTA }, {}, { SUPABASE_SERVICE_KEY: 'x', SUPABASE_URL: 'https://x.supabase.co' }, cae), 0.0031);
    assert.equal(await registrarGasto({ estado: 200, texto: RESPUESTA }, {}, {}, cae), 0.0031);
  } finally {
    console.error = silencio;
    console.warn = aviso;
  }
});

test('el mes empieza a las 00:00 de México, no de UTC', () => {
  // 1 de noviembre 03:00 UTC aún es 31 de octubre en México.
  assert.equal(inicioDeMes(new Date('2026-11-01T03:00:00Z')), '2026-10-01T00:00:00-06:00');
  assert.equal(inicioDeMes(new Date('2026-11-01T07:00:00Z')), '2026-11-01T00:00:00-06:00');
});

test('el resumen sin llave de servicio avisa qué falta', async () => {
  const { estado, cuerpo } = await resumenDelMes({});
  assert.equal(estado, 503);
  assert.equal(cuerpo.error.codigo, 'SIN_BASE');
});
