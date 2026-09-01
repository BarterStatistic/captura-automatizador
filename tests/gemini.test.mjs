// Las partes de la conversación con Gemini que no necesitan red: armar la
// petición y entender la respuesta. La llamada en sí se prueba a mano con
// documentos reales.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  construirCuerpo,
  interpretarRespuesta,
  ErrorGemini,
} from '../src/lib/gemini.js';

const ESQUEMA = {
  type: 'object',
  properties: { curp: { type: 'string', nullable: true } },
};

test('la petición manda el prompt y el archivo juntos', () => {
  const cuerpo = construirCuerpo('Lee la credencial', ESQUEMA, {
    mime: 'image/jpeg',
    datos: 'BASE64',
  });

  assert.equal(cuerpo.contents[0].parts[0].text, 'Lee la credencial');
  assert.deepEqual(cuerpo.contents[0].parts[1].inline_data, {
    mime_type: 'image/jpeg',
    data: 'BASE64',
  });
});

test('la petición pide JSON con temperatura cero', () => {
  const cuerpo = construirCuerpo('Lee', ESQUEMA, { mime: 'application/pdf', datos: 'X' });

  assert.equal(cuerpo.generationConfig.temperature, 0);
  assert.equal(cuerpo.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(cuerpo.generationConfig.responseSchema, ESQUEMA);
});

test('una respuesta normal devuelve el objeto extraído', () => {
  const respuesta = JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"curp":"PEGJ900115HCLRMN08"}' }] } }],
  });

  assert.deepEqual(interpretarRespuesta(respuesta), { curp: 'PEGJ900115HCLRMN08' });
});

test('las cadenas vacías se vuelven null para que la app las marque en rojo', () => {
  const respuesta = JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"curp":"   "}' }] } }],
  });

  assert.deepEqual(interpretarRespuesta(respuesta), { curp: null });
});

test('los textos extraídos vienen sin espacios sobrantes', () => {
  const respuesta = JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"curp":"  PEGJ900115HCLRMN08 "}' }] } }],
  });

  assert.deepEqual(interpretarRespuesta(respuesta), { curp: 'PEGJ900115HCLRMN08' });
});

test('una respuesta que no es JSON se reporta como error de Gemini', () => {
  assert.throws(() => interpretarRespuesta('<html>502 Bad Gateway</html>'), ErrorGemini);
});

test('una respuesta sin candidatos se reporta como error de Gemini', () => {
  assert.throws(() => interpretarRespuesta(JSON.stringify({ candidates: [] })), ErrorGemini);
});
