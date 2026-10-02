// El reenvío a Gemini que hace el servidor. La clave vive solo aquí; estas
// pruebas fijan que se agrega, que no se manda sin ella y que la respuesta de
// Google vuelve intacta a la página.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODELO_POR_DEFECTO, entornoDesde, reenviarAGemini } from '../api/_proxy.js';

const CUERPO = { contents: [{ parts: [{ text: 'ping' }] }] };

function fetchFalso(estado = 200, texto = '{"ok":true}') {
  const llamadas = [];
  const traer = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return { status: estado, text: async () => texto };
  };
  return { traer, llamadas };
}

test('sin clave no se llama a Google y se explica qué hacer', async () => {
  const { traer, llamadas } = fetchFalso();
  const { estado, texto } = await reenviarAGemini(CUERPO, { apiKey: '  ', fetch: traer });

  assert.equal(estado, 500);
  assert.equal(llamadas.length, 0);
  assert.equal(JSON.parse(texto).error.codigo, 'SIN_CLAVE');
  assert.match(JSON.parse(texto).error.message, /GEMINI_API_KEY/);
});

test('la clave viaja en la cabecera, nunca en la URL', async () => {
  const { traer, llamadas } = fetchFalso();
  await reenviarAGemini(CUERPO, { apiKey: 'CLAVE-SECRETA', fetch: traer });

  assert.equal(llamadas[0].opciones.headers['x-goog-api-key'], 'CLAVE-SECRETA');
  assert.doesNotMatch(llamadas[0].url, /CLAVE-SECRETA/);
});

test('se usa el modelo por defecto salvo que el entorno diga otro', async () => {
  const uno = fetchFalso();
  await reenviarAGemini(CUERPO, { apiKey: 'k', fetch: uno.traer });
  assert.match(uno.llamadas[0].url, new RegExp(`${MODELO_POR_DEFECTO}:generateContent$`));

  const dos = fetchFalso();
  await reenviarAGemini(CUERPO, { apiKey: 'k', modelo: 'gemini-3-flash', fetch: dos.traer });
  assert.match(dos.llamadas[0].url, /gemini-3-flash:generateContent$/);
});

test('la respuesta de Google vuelve tal cual, también los errores', async () => {
  const { traer } = fetchFalso(429, '{"error":{"message":"Quota exceeded"}}');
  const resultado = await reenviarAGemini(CUERPO, { apiKey: 'k', fetch: traer });

  assert.deepEqual(resultado, { estado: 429, texto: '{"error":{"message":"Quota exceeded"}}' });
});

test('un cuerpo sin contents se rechaza sin gastar cuota', async () => {
  const { traer, llamadas } = fetchFalso();
  const { estado } = await reenviarAGemini({ hola: 1 }, { apiKey: 'k', fetch: traer });

  assert.equal(estado, 400);
  assert.equal(llamadas.length, 0);
});

test('si el servidor no llega a Google, se dice que fue del lado del servidor', async () => {
  const traer = async () => {
    throw new Error('ECONNRESET');
  };
  const { estado, texto } = await reenviarAGemini(CUERPO, { apiKey: 'k', fetch: traer });

  assert.equal(estado, 502);
  assert.match(texto, /servidor/);
});

test('el entorno se lee de las variables con los nombres documentados', () => {
  assert.deepEqual(entornoDesde({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' }), {
    apiKey: 'k',
    modelo: 'm',
  });
});
