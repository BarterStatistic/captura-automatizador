// Cuando el navegador no logra ni enviar la petición, lo único que da es
// «Failed to fetch». Ese texto no distingue entre una clave restringida por
// dominio, una red que bloquea googleapis y un bloqueador de anuncios, que son
// las tres causas reales. Estas pruebas fijan el mensaje que sí lo explica.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { explicarFalloDeRed, explicarRespuesta } from '../src/lib/diagnostico.js';

test('el fallo de red nombra las causas posibles del lado del capturista', () => {
  const mensaje = explicarFalloDeRed(new TypeError('Failed to fetch'), 'https://captura.vercel.app');

  assert.match(mensaje, /internet/i);
  assert.match(mensaje, /red/i);
  assert.match(mensaje, /bloqueador|extensi[óo]n/i);
});

test('el fallo de red incluye el origen desde el que se intentó', () => {
  const mensaje = explicarFalloDeRed(new TypeError('Failed to fetch'), 'https://captura.vercel.app');

  assert.match(mensaje, /https:\/\/captura\.vercel\.app/);
});

test('la clave faltante en el servidor se explica con su propio mensaje', () => {
  const cuerpo = JSON.stringify({
    error: { message: 'Falta GEMINI_API_KEY en el servidor.', codigo: 'SIN_CLAVE' },
  });

  assert.equal(explicarRespuesta(500, cuerpo), 'Falta GEMINI_API_KEY en el servidor.');
});

test('un archivo demasiado grande para Vercel se explica', () => {
  assert.match(explicarRespuesta(413, 'Request Entity Too Large'), /grande|3 MB/i);
});

test('un 400 se explica como clave mal escrita', () => {
  const mensaje = explicarRespuesta(400, '{"error":{"message":"API key not valid"}}');

  assert.match(mensaje, /clave|key/i);
  assert.match(mensaje, /400/);
});

test('un 403 apunta a permisos o restricciones de la clave', () => {
  const mensaje = explicarRespuesta(403, '{"error":{"message":"PERMISSION_DENIED"}}');

  assert.match(mensaje, /restringida|permiso|habilitada/i);
});

test('un 429 explica que se agotó la cuota', () => {
  const mensaje = explicarRespuesta(429, '{"error":{"message":"Quota exceeded"}}');

  assert.match(mensaje, /cuota|l[íi]mite/i);
});

test('un error del servidor se distingue de uno de la clave', () => {
  const mensaje = explicarRespuesta(503, 'Service Unavailable');

  assert.match(mensaje, /Gemini|servidor|int[ée]ntalo/i);
  assert.doesNotMatch(mensaje, /clave incorrecta/i);
});

test('el mensaje de Google se conserva, porque suele decir lo concreto', () => {
  const mensaje = explicarRespuesta(400, '{"error":{"message":"API key not valid"}}');

  assert.match(mensaje, /API key not valid/);
});

test('una respuesta que no es JSON no rompe la explicación', () => {
  const mensaje = explicarRespuesta(502, '<html>Bad Gateway</html>');

  assert.ok(mensaje.length > 0);
  assert.match(mensaje, /502/);
});
