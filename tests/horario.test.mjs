// Horarios de visita escritos a mano → horas enteras (0-23) del menú de Dinamo.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { horarioLegible, interpretarHorario } from '../src/lib/horario.js';

const lee = (texto) => {
  const r = interpretarHorario(texto);
  return r && { de: r.de, a: r.a };
};

test('con am/pm se respeta: «6am a 6pm» y «7pm 10pm» (los del formulario nuevo)', () => {
  assert.deepEqual(lee('6am a 6pm'), { de: 6, a: 18 });
  assert.deepEqual(lee('7pm 10pm'), { de: 19, a: 22 });
  assert.deepEqual(lee('9 a.m. - 5 p.m.'), { de: 9, a: 17 });
  assert.deepEqual(lee('12pm a 3pm'), { de: 12, a: 15 });
  assert.deepEqual(lee('12am a 6am'), { de: 0, a: 6 });
});

test('formato de 24 horas, con minutos que se redondean hacia abajo', () => {
  assert.deepEqual(lee('8:00 - 17:00'), { de: 8, a: 17 });
  const r = interpretarHorario('8:30 a 17:45');
  assert.deepEqual({ de: r.de, a: r.a }, { de: 8, a: 17 });
  assert.match(r.avisos[0], /minutos/);
});

test('sin am/pm: «de 9 a 5» es de 9 a 17, y se avisa', () => {
  const r = interpretarHorario('de 9 a 5');

  assert.deepEqual({ de: r.de, a: r.a }, { de: 9, a: 17 });
  assert.match(r.avisos[0], /no trae am\/pm/);
});

test('«tarde» y «noche» vuelven p. m. las horas sin am/pm', () => {
  assert.deepEqual(lee('de 6 a 9 de la noche'), { de: 18, a: 21 });
  assert.deepEqual(lee('de 2 a 5 por la tarde'), { de: 14, a: 17 });
});

test('una sola am/pm: la otra hora se lee en el mismo día', () => {
  assert.deepEqual(lee('9 a 6pm'), { de: 9, a: 18 });
  assert.deepEqual(lee('6am a 6'), { de: 6, a: 18 });
});

test('sin horas, «por las tardes» se traduce a un rango y se avisa que es aproximado', () => {
  const r = interpretarHorario('por las tardes');

  assert.deepEqual({ de: r.de, a: r.a }, { de: 14, a: 19 });
  assert.match(r.avisos[0], /no trae horas/);
  assert.deepEqual(lee('cualquier hora'), { de: 8, a: 20 });
});

test('cruzar la medianoche no cabe en el menú: se recorta y se avisa', () => {
  const r = interpretarHorario('10pm a 2am');

  assert.deepEqual({ de: r.de, a: r.a }, { de: 22, a: 23 });
  assert.match(r.avisos[0], /medianoche/);
});

test('lo que no es un horario no se inventa', () => {
  assert.equal(interpretarHorario(''), null);
  assert.equal(interpretarHorario(null), null);
  assert.equal(interpretarHorario('lunes a viernes'), null);
  assert.equal(interpretarHorario('a las 5'), null, 'una sola hora no es un horario');
  assert.equal(interpretarHorario('de 25 a 30'), null);
});

test('se muestra como «de 6 a 18 h»', () => {
  assert.equal(horarioLegible(interpretarHorario('6am a 6pm')), 'de 6 a 18 h');
  assert.equal(horarioLegible(null), '');
});
