// Los vendedores no deben ver el costo de la API en ningún lado, tampoco en las
// cabeceras de la respuesta de /api/gemini (se leen en la pestaña de red).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/gemini.js';
import { COOKIE, crearSesion, secretoDe } from '../api/_sesion.js';

const ENTORNO = { GEMINI_API_KEY: 'clave' };

async function llamarComo(nombre) {
  const cabeceras = {};
  const res = {
    setHeader: (k, v) => {
      cabeceras[k.toLowerCase()] = v;
    },
    status() {
      return this;
    },
    send() {},
  };
  const req = {
    method: 'POST',
    headers: { cookie: `${COOKIE}=${crearSesion(nombre, secretoDe(ENTORNO))}` },
    body: { contents: [{ parts: [{ text: 'hola' }] }] },
  };

  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  Object.assign(process.env, ENTORNO);
  delete process.env.SUPABASE_SERVICE_KEY;
  globalThis.fetch = async () => ({
    status: 200,
    text: async () =>
      JSON.stringify({ usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 500 } }),
  });
  const advertencia = console.warn;
  console.warn = () => {};
  try {
    await handler(req, res);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    console.warn = advertencia;
  }
  return cabeceras;
}

test('al admin le llega el costo en la cabecera; al vendedor, ninguna pista', async () => {
  const admin = await llamarComo('Braulio Acosta');
  assert.ok(Number(admin['x-costo-usd']) > 0);

  const vendedor = await llamarComo('Bryan Barboza');
  assert.equal(vendedor['x-costo-usd'], undefined);
  assert.equal(JSON.stringify(vendedor).toLowerCase().includes('costo'), false);
});
