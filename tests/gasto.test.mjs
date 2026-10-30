// El gasto de Gemini: costo por llamada, registro en Supabase y mes en curso.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rangoDe, registrarGasto, tipoValido, usoDeRespuesta } from '../api/_gasto.js';

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

test('cada periodo empieza a las 00:00 de México, no de UTC', () => {
  // Sábado 31 oct 2026, 03:00 UTC = viernes 30 oct 21:00 en México.
  const ahora = new Date('2026-10-31T03:00:00Z');
  assert.deepEqual(rangoDe('dia', ahora), { desde: '2026-10-30T00:00:00-06:00', hasta: ahora.toISOString(), paso: 'hour' });
  assert.equal(rangoDe('semana', ahora).desde, '2026-10-26T00:00:00-06:00'); // lunes
  assert.equal(rangoDe('semana', ahora).paso, 'day');
  assert.equal(rangoDe('mes', ahora).desde, '2026-10-01T00:00:00-06:00');
  assert.equal(rangoDe('trimestre', ahora).desde, '2026-10-01T00:00:00-06:00');
  assert.equal(rangoDe('trimestre', ahora).paso, 'week');
  // Un domingo cuenta para la semana que empezó el lunes anterior.
  assert.equal(rangoDe('semana', new Date('2026-11-01T18:00:00Z')).desde, '2026-10-26T00:00:00-06:00');
  // Enero abre el primer trimestre; el 1 de abril abre el segundo.
  assert.equal(rangoDe('trimestre', new Date('2027-02-10T12:00:00Z')).desde, '2027-01-01T00:00:00-06:00');
  assert.equal(rangoDe('trimestre', new Date('2026-05-10T12:00:00Z')).desde, '2026-04-01T00:00:00-06:00');
});

test('el tipo de crédito se guarda en la fila; si la columna aún no existe se reintenta sin ella', async () => {
  const cuerpos = [];
  const traer = async (url, opciones) => {
    const cuerpo = JSON.parse(opciones.body);
    cuerpos.push(cuerpo);
    // Simula una base a la que todavía no se le corrió usuarios.sql.
    if ('tipo_credito' in cuerpo) return { ok: false, status: 400, text: async () => 'column does not exist' };
    return { ok: true, status: 201, text: async () => '' };
  };
  const silencio = console.error;
  console.error = () => {};
  try {
    await registrarGasto(
      { estado: 200, texto: RESPUESTA },
      { usuario: 'Bryan Barboza', captura: 'c-1', tipoCredito: 'motoxpress' },
      { SUPABASE_SERVICE_KEY: 'llave', SUPABASE_URL: 'https://x.supabase.co' },
      traer,
    );
  } finally {
    console.error = silencio;
  }
  assert.equal(cuerpos.length, 2);
  assert.equal(cuerpos[0].tipo_credito, 'MOTOXPRESS');
  assert.equal('tipo_credito' in cuerpos[1], false);
});

test('solo se acepta como tipo de crédito un nombre razonable', () => {
  assert.equal(tipoValido(' motoxpress flex '), 'MOTOXPRESS FLEX');
  assert.equal(tipoValido(''), null);
  assert.equal(tipoValido(undefined), null);
  assert.equal(tipoValido('x'.repeat(41)), null);
  assert.equal(tipoValido('credinamo; drop table'), null);
});
