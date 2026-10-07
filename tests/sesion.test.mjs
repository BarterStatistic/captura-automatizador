// El inicio de sesión del servidor: quién entra, que la cookie no se pueda
// falsificar ni dure para siempre, y que sin secreto no se abra nada.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COOKIE,
  DURACION_MS,
  atenderLogin,
  atenderSesion,
  cookieBorrada,
  cookieDeSesion,
  crearSesion,
  esSegura,
  haySesion,
  leerSesion,
  secretoDe,
  tokenDeCookies,
  verificarCredenciales,
} from '../api/_sesion.js';

const ENTORNO = { GEMINI_API_KEY: 'clave-de-prueba' };
const AHORA = Date.UTC(2026, 9, 6, 15);

test('entra Braulio Acosta con su contraseña', () => {
  assert.equal(verificarCredenciales('Braulio Acosta', 'xbox2015'), 'Braulio Acosta');
});

test('el usuario se reconoce sin mayúsculas, acentos ni espacios de más', () => {
  assert.equal(verificarCredenciales('  braulio   ACOSTA ', 'xbox2015'), 'Braulio Acosta');
});

test('contraseña equivocada, vacía o usuario que no existe: no entra', () => {
  assert.equal(verificarCredenciales('Braulio Acosta', 'xbox2016'), null);
  assert.equal(verificarCredenciales('Braulio Acosta', ''), null);
  assert.equal(verificarCredenciales('Otro Usuario', 'xbox2015'), null);
  assert.equal(verificarCredenciales(undefined, undefined), null);
});

test('la contraseña no está escrita en el código', async () => {
  const { readFile } = await import('node:fs/promises');
  const fuente = await readFile(new URL('../api/_sesion.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fuente, /xbox2015/);
});

test('la sesión firmada se lee y dice quién es', () => {
  const secreto = secretoDe(ENTORNO);
  const token = crearSesion('Braulio Acosta', secreto, AHORA);
  assert.equal(leerSesion(token, secreto, AHORA + 1000), 'Braulio Acosta');
});

test('la sesión vence a las 12 horas', () => {
  const secreto = secretoDe(ENTORNO);
  const token = crearSesion('Braulio Acosta', secreto, AHORA);
  assert.equal(leerSesion(token, secreto, AHORA + DURACION_MS - 1), 'Braulio Acosta');
  assert.equal(leerSesion(token, secreto, AHORA + DURACION_MS), null);
});

test('una sesión alterada o firmada con otro secreto no vale', () => {
  const secreto = secretoDe(ENTORNO);
  const token = crearSesion('Braulio Acosta', secreto, AHORA);
  const [datos, sello] = token.split('.');
  const otrosDatos = Buffer.from(JSON.stringify({ u: 'Braulio Acosta', exp: AHORA * 2 })).toString('base64url');

  assert.equal(leerSesion(`${otrosDatos}.${sello}`, secreto, AHORA), null);
  assert.equal(leerSesion(`${datos}.x${sello.slice(1)}`, secreto, AHORA), null);
  assert.equal(leerSesion(token, secretoDe({ GEMINI_API_KEY: 'otra' }), AHORA), null);
  assert.equal(leerSesion('basura', secreto, AHORA), null);
  assert.equal(leerSesion('', secreto, AHORA), null);
});

test('una sesión de un usuario que ya no está en la lista no vale', () => {
  const secreto = secretoDe(ENTORNO);
  assert.equal(leerSesion(crearSesion('Alguien Más', secreto, AHORA), secreto, AHORA), null);
});

test('SESION_SECRETO manda sobre el derivado de GEMINI_API_KEY; sin ninguno no hay secreto', () => {
  assert.equal(secretoDe({ SESION_SECRETO: 'propio', GEMINI_API_KEY: 'x' }), 'propio');
  assert.notEqual(secretoDe(ENTORNO), 'clave-de-prueba');
  assert.ok(secretoDe(ENTORNO).length > 20);
  assert.equal(secretoDe({}), '');
});

test('login correcto devuelve la cookie HttpOnly; incorrecto, 401 sin cookie', () => {
  const bien = atenderLogin({ usuario: 'Braulio Acosta', password: 'xbox2015' }, ENTORNO, {
    segura: true,
    ahora: AHORA,
  });
  assert.equal(bien.estado, 200);
  assert.deepEqual(bien.cuerpo, { usuario: 'Braulio Acosta' });
  assert.match(bien.cookie, new RegExp(`^${COOKIE}=`));
  assert.match(bien.cookie, /HttpOnly/);
  assert.match(bien.cookie, /Secure/);
  assert.match(bien.cookie, /SameSite=Lax/);

  const mal = atenderLogin({ usuario: 'Braulio Acosta', password: 'nop' }, ENTORNO);
  assert.equal(mal.estado, 401);
  assert.equal(mal.cookie, undefined);
  assert.equal(mal.cuerpo.error.codigo, 'CREDENCIALES');
});

test('sin secreto el servidor no deja entrar a nadie', () => {
  const r = atenderLogin({ usuario: 'Braulio Acosta', password: 'xbox2015' }, {});
  assert.equal(r.estado, 500);
  assert.equal(r.cuerpo.error.codigo, 'SIN_SECRETO');
});

test('la cookie del login abre la sesión y la de logout la cierra', () => {
  const { cookie } = atenderLogin({ usuario: 'Braulio Acosta', password: 'xbox2015' }, ENTORNO);
  const cabecera = `otra=1; ${cookie.split(';')[0]}`;

  assert.equal(tokenDeCookies(cabecera).length > 0, true);
  assert.equal(haySesion(cabecera, ENTORNO), true);
  assert.deepEqual(atenderSesion(cabecera, ENTORNO).cuerpo, { usuario: 'Braulio Acosta' });

  assert.equal(haySesion('', ENTORNO), false);
  assert.equal(atenderSesion(undefined, ENTORNO).estado, 401);
  assert.match(cookieBorrada(false), /Max-Age=0/);
});

test('Secure solo detrás de https', () => {
  assert.equal(esSegura({ 'x-forwarded-proto': 'https' }), true);
  assert.equal(esSegura({ 'x-forwarded-proto': 'http' }), false);
  assert.equal(esSegura({}), false);
  assert.doesNotMatch(cookieDeSesion('t', false), /Secure/);
});
