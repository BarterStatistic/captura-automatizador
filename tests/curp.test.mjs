// La CURP se valida, se corrige cuando la foto confundió caracteres y se coteja
// con el nombre. Nunca se inventa: ante la duda se deja lo leído y se avisa.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  analizarCurp,
  digitoVerificador,
  fechaDeCurp,
  posicionesEsperadas,
  repararCurp,
  sexoDeCurp,
} from '../src/lib/curp.js';

// Persona ficticia. PEGJ900115HCLRMN08 es válida (el dígito 8 sale de las 17 primeras).
const PERSONA = {
  nombres: 'JUAN',
  paterno: 'PEREZ',
  materno: 'GOMEZ',
  fechaNacimiento: '1990-01-15',
  sexo: 'H',
};
const BUENA = 'PEGJ900115HCLRMN08';

test('el dígito verificador se calcula de las 17 primeras posiciones', () => {
  assert.equal(digitoVerificador(BUENA.slice(0, 17)), '8');
});

test('la fecha y el sexo salen de la CURP; el siglo, del carácter 17', () => {
  assert.equal(fechaDeCurp(BUENA), '1990-01-15');
  assert.equal(sexoDeCurp(BUENA), 'H');
  // Nacida en 2003: el carácter 17 es una letra.
  assert.equal(fechaDeCurp('ABCD030720MCLXYZA5'), '2003-07-20');
  assert.equal(fechaDeCurp('ABCD031340MCLXYZA5'), null, 'el mes 13 no existe');
});

test('de nombre, fecha y sexo se calculan las posiciones que se pueden comprobar', () => {
  const esperado = posicionesEsperadas(PERSONA);

  assert.equal(esperado.slice(0, 4).join(''), 'PEGJ');
  assert.equal(esperado.slice(4, 10).join(''), '900115');
  assert.equal(esperado[10], 'H');
  assert.equal(esperado.slice(13, 16).join(''), 'RMN');
  assert.equal(esperado[11], null, 'la entidad no se puede calcular');
  assert.equal(esperado[17], null, 'ni el dígito verificador');
});

test('JOSE y MARIA se omiten si hay otro nombre; las partículas no cuentan', () => {
  const jose = posicionesEsperadas({ ...PERSONA, nombres: 'JOSE LUIS' });
  assert.equal(jose[3], 'L');

  const particula = posicionesEsperadas({ ...PERSONA, paterno: 'DE LA CRUZ', nombres: 'ANA', materno: 'RUIZ' });
  assert.equal(particula.slice(0, 4).join(''), 'CURA');
});

test('una palabra inconveniente cambia la SEGUNDA letra de la CURP por X', () => {
  // CASTRO CORTES ANA → CACA, que es palabra inconveniente: queda CXCA.
  const esperado = posicionesEsperadas({ nombres: 'ANA', paterno: 'CASTRO', materno: 'CORTES', fechaNacimiento: '1990-01-15', sexo: 'M' });
  assert.equal(esperado.slice(0, 4).join(''), 'CXCA');
});

test('una CURP buena se acepta tal cual, con su estado de nacimiento', () => {
  const r = analizarCurp({ curp: BUENA, ...PERSONA });

  assert.equal(r.curp, BUENA);
  assert.equal(r.valida, true);
  assert.equal(r.corregida, false);
  assert.equal(r.estado.dinamo, 'COAHUILA');
  assert.equal(r.fecha, '1990-01-15');
  assert.equal(r.sexo, 'H');
  assert.deepEqual(r.avisos, []);
});

test('espacios y minúsculas no impiden leerla', () => {
  assert.equal(analizarCurp({ curp: 'pegj 900115 hclrmn08', ...PERSONA }).curp, BUENA);
});

test('O por 0 en la fecha: se corrige y se avisa qué cambió', () => {
  const r = analizarCurp({ curp: 'PEGJ9OO115HCLRMN08', ...PERSONA });

  assert.equal(r.curp, BUENA);
  assert.equal(r.corregida, true);
  assert.equal(r.valida, true);
  assert.match(r.avisos[0].mensaje, /posición 6.*«O» → «0»/);
});

test('una letra mal leída se corrige porque el nombre dice cuál era', () => {
  // La M de la consonante interna del materno se leyó como W.
  const r = analizarCurp({ curp: 'PEGJ900115HCLRWN08', ...PERSONA });

  assert.equal(r.curp, BUENA);
  assert.equal(r.corregida, true);
  assert.match(r.avisos[0].mensaje, /posición 15/);
});

test('si hay dos correcciones igual de buenas, NO se elige ninguna', () => {
  // Solo falla el último dígito: pudo ser el 8 o pudo ser la entidad. Sin más
  // evidencia es ambigua y se deja lo leído.
  const r = analizarCurp({ curp: 'PEGJ900115HCLRMN09', ...PERSONA });

  assert.equal(r.valida, false);
  assert.equal(r.corregida, false);
  assert.equal(r.curp, 'PEGJ900115HCLRMN09');
  assert.match(r.avisos[0].mensaje, /no se pudo corregir con seguridad/);
});

test('con 19 caracteres que cuadran con una sola CURP, se quita el que sobra', () => {
  const r = repararCurp('PEGJ900115HCLRMNN08', posicionesEsperadas(PERSONA));

  assert.equal(r.ambigua, false);
  assert.equal(r.curp, BUENA);
  assert.equal(r.indel, true);
});

test('sin nombre ni fecha con qué comprobar solo se corrigen confusiones de foto', () => {
  // Solo la O de la fecha: confusión de foto, sin nombre se acepta si el dígito cuadra.
  assert.equal(analizarCurp({ curp: 'PEGJ9OO115HCLRMN08' }).curp, BUENA);
  // Una letra cualquiera cambiada NO se arregla sin nombre.
  const r = analizarCurp({ curp: 'PEGJ900115HCLRWN08' });
  assert.equal(r.corregida, false);
  assert.equal(r.valida, false);
});

test('si el frente no pasa y el reverso sí, se usa el del reverso', () => {
  const r = analizarCurp({ curp: 'PEGJ900115HCLRMN99', curpReverso: BUENA, ...PERSONA });

  assert.equal(r.curp, BUENA);
  assert.equal(r.valida, true);
  assert.match(r.avisos[0].mensaje, /frente.*no pasa la verificación/);
});

test('una CURP válida con otra fecha que la INE: manda la de la CURP y se avisa', () => {
  const r = analizarCurp({ curp: BUENA, ...PERSONA, fechaNacimiento: '1990-01-16' });

  assert.equal(r.fecha, '1990-01-15');
  const aviso = r.avisos.find((a) => a.campo === 'fechaNacimiento');
  assert.match(aviso.mensaje, /1990-01-16.*1990-01-15/);
});

test('una CURP válida que no cuadra con el nombre leído avisa, no cambia nada', () => {
  const r = analizarCurp({ curp: BUENA, ...PERSONA, nombres: 'LUIS' });

  assert.equal(r.curp, BUENA);
  assert.equal(r.corregida, false);
  assert.match(r.avisos[0].mensaje, /no cuadra con las iniciales/);
});

test('nacido en el extranjero (NE): válida pero sin estado de Dinamo', () => {
  const sinDigito = 'PEGJ900115HNERMN0';
  const curp = sinDigito + digitoVerificador(sinDigito.padEnd(17, '0').slice(0, 17));
  const r = analizarCurp({ curp, ...PERSONA });

  assert.equal(r.valida, true);
  assert.equal(r.estado, null);
});

test('sin CURP no hay nada que corregir ni inventar', () => {
  const r = analizarCurp({ ...PERSONA });

  assert.equal(r.curp, '');
  assert.equal(r.valida, false);
  assert.deepEqual(r.avisos, []);
});
