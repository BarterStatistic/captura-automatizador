// Lo que el formulario del vendedor trae además de los siete puntos pasa a la
// captura manual, sin pisar nunca lo que el capturista ya eligió.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extrasAlManual,
  opcionPorNombre,
  personasEn,
  puntosDelFormulario,
  respaldoDelTexto,
  respuestaDe,
  textoParaGemini,
} from '../src/lib/formulario.js';
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

// --- Respaldo de personas desde el texto pegado ------------------------------------

const ESQUELETO = `Favor de llenar la siguiente información para llenar su solicitud de crédito 🤝

1) Correo electrónico: pedro@hotmail.com

2) Nombre y dirección
Walmart Saltillo

3) Antigüedad laboral
3 años

4)Nombre y teléfono de algún compañero de su trabajo
Jorge Ramírez 844 222 3344

5)Tiempo viviendo en su casa actual: toda la vida

6)Nombre y teléfono de algún amigo, conocido o familiar
Mi hermano Luis Pérez 844-123-4567
Mamá: Rosa Pérez (madre) +52 844 765 4321


7)Número de seguro social (Opcional)
12345678901`;

test('el texto pegado se parte en sus siete puntos', () => {
  const puntos = puntosDelFormulario(ESQUELETO);

  assert.deepEqual(Object.keys(puntos), ['1', '2', '3', '4', '5', '6', '7']);
  assert.match(puntos['6'], /Luis Pérez/);
  assert.doesNotMatch(puntos['6'], /seguro social/);
});

test('cada teléfono del punto 6 es una persona, sin parentescos en el nombre', () => {
  const personas = personasEn(puntosDelFormulario(ESQUELETO)['6']);

  assert.deepEqual(personas, [
    { nombre: 'Luis Pérez', telefono: '844-123-4567' },
    { nombre: 'Rosa Pérez', telefono: '+52 844 765 4321' },
  ]);
});

test('nombre y teléfono en renglones separados, o el teléfono primero', () => {
  assert.deepEqual(personasEn('Rosa Martínez\n844 765 4321'), [
    { nombre: 'Rosa Martínez', telefono: '844 765 4321' },
  ]);
  assert.deepEqual(personasEn('8441112233 Carlos Díaz'), [
    { nombre: 'Carlos Díaz', telefono: '8441112233' },
  ]);
});

test('el NSS del punto 7 no se confunde con un teléfono', () => {
  const personas = personasEn(puntosDelFormulario(ESQUELETO)['6']);

  assert.ok(!personas.some((persona) => persona.telefono.includes('12345678901')));
});

test('lo que Gemini dejó vacío se completa con el texto; lo que leyó se respeta', () => {
  const lectura = { referencia_nombre: 'Luis', referencia_telefono: null, companero_nombre: null };
  const nueva = respaldoDelTexto(lectura, ESQUELETO);

  assert.equal(nueva.referencia_nombre, 'Luis');
  assert.equal(nueva.referencia_telefono, '844-123-4567');
  assert.equal(nueva.companero_nombre, 'Jorge Ramírez');
  assert.equal(nueva.companero_telefono, '844 222 3344');
  assert.deepEqual(nueva.referencias_extra, [{ nombre: 'Rosa Pérez', telefono: '+52 844 765 4321' }]);
});

test('un texto sin numerar no inventa personas', () => {
  const lectura = {
    correo: 'pedro@gmail.com',
    referencia_nombre: 'Sofía Gómez',
    referencia_telefono: '8449990011',
  };

  assert.deepEqual(respaldoDelTexto(lectura, 'pedro@gmail.com / Sofía 8449990011'), lectura);
});

// --- Formatos de WhatsApp y respaldo de los demás puntos ----------------------------

const WHATSAPP = `*1️⃣ Correo electrónico:* Pedro.Ruiz @Gmail.com
*2️⃣ Nombre y dirección*
_Tornillos del Norte, Blvd. Fundadores 500_
3️⃣ Antigüedad laboral
3-4 años
4️⃣ Nombre y teléfono de algún compañero de su trabajo
Jorge Ramírez 844 222 3344
5️⃣ Tiempo viviendo en su casa actual: toda la vida
6️⃣ Nombre y teléfono de algún amigo, conocido o familiar
Luis Pérez 844-123-4567
7️⃣ Número de seguro social (Opcional)
123 4567 8901
Cel del cliente: 844 555 6677`;

test('los emojis de número y las negritas de WhatsApp también marcan los puntos', () => {
  const puntos = puntosDelFormulario(WHATSAPP);

  assert.deepEqual(Object.keys(puntos), ['1', '2', '3', '4', '5', '6', '7']);
  assert.equal(respuestaDe(puntos, 2), 'Tornillos del Norte, Blvd. Fundadores 500');
});

test('«3-4 años» al inicio de renglón no abre otro punto 3', () => {
  const puntos = puntosDelFormulario(WHATSAPP);

  assert.equal(respuestaDe(puntos, 3), '3-4 años');
  assert.equal(respuestaDe(puntos, 5), 'toda la vida');
});

test('a Gemini le llegan las respuestas ya separadas por punto', () => {
  const texto = textoParaGemini(WHATSAPP);

  assert.match(texto, /RESPUESTAS SEPARADAS POR PUNTO/);
  assert.match(texto, /Punto 4 \(compañero de trabajo\): Jorge Ramírez 844 222 3344/);
  assert.equal(textoParaGemini('solo un renglón'), 'solo un renglón');
});

test('lo que Gemini dejó vacío de los demás puntos sale del texto', () => {
  const nueva = respaldoDelTexto({}, WHATSAPP);

  assert.equal(nueva.correo, 'pedro.ruiz@gmail.com');
  assert.equal(nueva.empleo, 'Tornillos del Norte');
  assert.equal(nueva.antiguedad_laboral, '3-4 años');
  assert.equal(nueva.antiguedad_domicilio, 'toda la vida');
  assert.equal(nueva.nss, '12345678901');
  assert.equal(nueva.celular, '844 555 6677');
  assert.equal(nueva.companero_nombre, 'Jorge Ramírez');
  assert.equal(nueva.referencia_telefono, '844-123-4567');
});

test('el respaldo no pisa lo que Gemini sí leyó', () => {
  const nueva = respaldoDelTexto({ correo: 'otro@hotmail.com', empleo: 'Walmart' }, WHATSAPP);

  assert.equal(nueva.correo, 'otro@hotmail.com');
  assert.equal(nueva.empleo, 'Walmart');
});
