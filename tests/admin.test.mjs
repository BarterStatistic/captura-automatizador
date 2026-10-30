// El panel y el gestor de usuarios de /admin: solo el admin entra, y las reglas
// del gestor (sin admins nuevos, sin borrar al admin, nombres únicos).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { atenderPanel, atenderUsuarios } from '../api/_admin.js';
import { COOKIE, atenderLogin, crearSesion, secretoDe, verificarCredenciales } from '../api/_sesion.js';
import { cargarUsuarios, hashearPassword } from '../api/_usuarios.js';

const ENTORNO = { GEMINI_API_KEY: 'clave', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'llave' };
const cookieDe = (nombre) => `${COOKIE}=${crearSesion(nombre, secretoDe(ENTORNO))}`;

const ADMIN = { id: 1, nombre: 'Braulio Acosta', rol: 'admin', activo: true, creado: '2026-10-01T00:00:00Z' };
const VENDEDOR = { id: 2, nombre: 'Bryan Barboza', rol: 'vendedor', activo: true, creado: '2026-10-02T00:00:00Z' };

/** Un Supabase de mentira: guarda las peticiones y contesta según la ruta. */
function baseFalsa(filas = [ADMIN, VENDEDOR]) {
  const peticiones = [];
  const traer = async (url, opciones = {}) => {
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;
    const metodo = opciones.method ?? 'GET';
    peticiones.push({ url, metodo, cuerpo });
    const json = (datos, status = 200) => ({ ok: status < 400, status, json: async () => datos, text: async () => '' });
    if (url.includes('/usuarios?select=nombre,rol,hash')) {
      return json(filas.map((f) => ({ ...f, hash: hashearPassword('x') })));
    }
    if (url.includes('/rpc/admin_resumen')) {
      return json({
        llamadas: 4,
        usd: 0.1,
        capturas: 2,
        por_tipo: [{ tipo: 'CREDINAMO', capturas: 2, llamadas: 4, usd: 0.1 }],
        por_usuario: [{ usuario: 'Bryan Barboza', llamadas: 4, usd: 0.1, capturas: 2, tipo_favorito: 'CREDINAMO' }],
      });
    }
    if (url.includes('/rpc/gemini_serie')) return json([{ t: '2026-10-01T00:00:00', usd: 0.1, llamadas: 4, capturas: 2 }]);
    if (metodo === 'POST') return json([{ id: 9, ...cuerpo }], 201);
    if (metodo === 'PATCH') return json([{ ...filas[0], ...cuerpo }]);
    if (metodo === 'DELETE') return { ok: true, status: 204, json: async () => null, text: async () => '' };
    const id = /id=eq\.(\d+)/.exec(url)?.[1];
    return json(id ? filas.filter((f) => String(f.id) === id) : filas);
  };
  return { traer, peticiones };
}

test('el panel: sin sesión 401, vendedor 403 sin cifras, admin 200', async () => {
  const { traer, peticiones } = baseFalsa();
  assert.equal((await atenderPanel('', '/api/admin', ENTORNO, new Date(), traer)).estado, 401);

  const antes = peticiones.length;
  const vendedor = await atenderPanel(cookieDe('Bryan Barboza'), '/api/admin?periodo=mes', ENTORNO, new Date(), traer);
  assert.equal(vendedor.estado, 403);
  assert.deepEqual(Object.keys(vendedor.cuerpo), ['error']);
  assert.equal(peticiones.slice(antes).some((p) => p.url.includes('/rpc/')), false, 'no consulta el consumo');

  const admin = await atenderPanel(cookieDe('Braulio Acosta'), '/api/admin?periodo=trimestre', ENTORNO, new Date(), traer);
  assert.equal(admin.estado, 200);
  assert.equal(admin.cuerpo.paso, 'week');
  assert.equal(admin.cuerpo.por_tipo[0].tipo, 'CREDINAMO');
});

test('el panel pone en ceros al vendedor sin capturas y nunca al admin', async () => {
  const otro = { id: 3, nombre: 'Ana López', rol: 'vendedor', activo: true, creado: '2026-10-03T00:00:00Z' };
  const { traer } = baseFalsa([ADMIN, VENDEDOR, otro]);
  const { cuerpo } = await atenderPanel(cookieDe('Braulio Acosta'), '/api/admin', ENTORNO, new Date(), traer);
  assert.deepEqual(cuerpo.por_usuario.map((f) => f.usuario), ['Bryan Barboza', 'Ana López']);
  assert.equal(cuerpo.por_usuario[1].capturas, 0);
});

test('periodo raro y falta de base se avisan', async () => {
  const { traer } = baseFalsa();
  const malo = await atenderPanel(cookieDe('Braulio Acosta'), '/api/admin?periodo=siglo', ENTORNO, new Date(), traer);
  assert.equal(malo.estado, 400);
  const sinBase = await atenderPanel(cookieDe('Braulio Acosta'), '/api/admin', { GEMINI_API_KEY: 'clave' });
  assert.equal(sinBase.estado, 503);
  assert.equal(sinBase.cuerpo.error.codigo, 'SIN_BASE');
});

test('el gestor de usuarios es solo del admin', async () => {
  const { traer, peticiones } = baseFalsa();
  for (const metodo of ['GET', 'POST', 'PATCH', 'DELETE']) {
    assert.equal((await atenderUsuarios(metodo, '', '/api/usuarios?id=2', {}, ENTORNO, traer)).estado, 401);
    const vendedor = await atenderUsuarios(metodo, cookieDe('Bryan Barboza'), '/api/usuarios?id=2', {}, ENTORNO, traer);
    assert.equal(vendedor.estado, 403);
  }
  assert.equal(peticiones.some((p) => p.metodo !== 'GET'), false, 'ni una escritura');
});

test('el alta crea siempre un vendedor, con la contraseña en hash', async () => {
  const { traer, peticiones } = baseFalsa();
  const datos = { nombre: ' Ana  López ', password: 'clave-larga-1', rol: 'admin' };
  const r = await atenderUsuarios('POST', cookieDe('Braulio Acosta'), '/api/usuarios', datos, ENTORNO, traer);
  assert.equal(r.estado, 201);
  const guardado = peticiones.find((p) => p.metodo === 'POST').cuerpo;
  assert.equal(guardado.rol, 'vendedor');
  assert.equal(guardado.nombre, 'Ana López');
  assert.equal(guardado.nombre_clave, 'ana lopez');
  assert.match(guardado.hash, /^scrypt:/);
  assert.doesNotMatch(JSON.stringify(guardado), /clave-larga-1/);
  const lista = [{ nombre: 'Ana López', hash: guardado.hash }];
  assert.equal(verificarCredenciales('Ana López', 'clave-larga-1', lista), 'Ana López');
});

test('el alta rechaza nombre corto, contraseña corta y nombre repetido', async () => {
  const { traer } = baseFalsa();
  const admin = cookieDe('Braulio Acosta');
  const alta = (datos, t = traer) => atenderUsuarios('POST', admin, '/api/usuarios', datos, ENTORNO, t);
  assert.equal((await alta({ nombre: 'A', password: 'clave-larga-1' })).estado, 400);
  assert.equal((await alta({ nombre: 'Ana', password: 'corta' })).estado, 400);

  const repetido = async () => ({ ok: false, status: 409, text: async () => '23505', json: async () => ({}) });
  assert.equal((await alta({ nombre: 'Ana', password: 'clave-larga-1' }, repetido)).estado, 409);
});

test('al editar no se toca el rol y el admin no se desactiva ni se borra', async () => {
  const { traer, peticiones } = baseFalsa();
  const admin = cookieDe('Braulio Acosta');
  const llamar = (metodo, url, cuerpo) => atenderUsuarios(metodo, admin, url, cuerpo, ENTORNO, traer);

  assert.equal((await llamar('PATCH', '/api/usuarios?id=1', { activo: false })).estado, 400);
  assert.equal((await llamar('DELETE', '/api/usuarios?id=1', null)).estado, 400);

  await llamar('PATCH', '/api/usuarios?id=2', { rol: 'admin', activo: false });
  const parche = peticiones.find((p) => p.metodo === 'PATCH' && p.url.includes('id=eq.2')).cuerpo;
  assert.equal('rol' in parche, false);
  assert.equal(parche.activo, false);

  assert.equal((await llamar('DELETE', '/api/usuarios?id=2', null)).estado, 200);
  assert.equal((await llamar('PATCH', '/api/usuarios', { activo: true })).estado, 400, 'sin id');
});

test('renombrar a un usuario conserva su historial de consumo', async () => {
  const { traer, peticiones } = baseFalsa();
  await atenderUsuarios('PATCH', cookieDe('Braulio Acosta'), '/api/usuarios?id=2', { nombre: 'Bryan B.' }, ENTORNO, traer);
  const historial = peticiones.find((p) => p.url.includes('gemini_uso?usuario=eq.'));
  assert.ok(historial, 'actualiza gemini_uso');
  assert.equal(historial.cuerpo.usuario, 'Bryan B.');
});

test('cargarUsuarios usa la tabla; sin base, sin tabla o vacía cae a los de respaldo', async () => {
  const { traer } = baseFalsa([VENDEDOR]);
  assert.deepEqual((await cargarUsuarios(ENTORNO, traer)).map((u) => u.nombre), ['Bryan Barboza']);

  const respaldo = (await cargarUsuarios({})).map((u) => u.nombre);
  assert.ok(respaldo.includes('Braulio Acosta'));
  const sinTabla = async () => ({ ok: false, status: 404, json: async () => ({}) });
  assert.deepEqual((await cargarUsuarios(ENTORNO, sinTabla)).map((u) => u.nombre), respaldo);
  const vacia = async () => ({ ok: true, status: 200, json: async () => [] });
  assert.deepEqual((await cargarUsuarios(ENTORNO, vacia)).map((u) => u.nombre), respaldo);
  const cae = async () => {
    throw new Error('sin red');
  };
  assert.deepEqual((await cargarUsuarios(ENTORNO, cae)).map((u) => u.nombre), respaldo);
});

test('un usuario nuevo de la tabla entra; uno que no está en la lista, no', () => {
  const usuarios = [{ nombre: 'Ana López', rol: 'vendedor', hash: hashearPassword('mi-clave-segura') }];
  const dentro = atenderLogin({ usuario: 'ana lopez', password: 'mi-clave-segura' }, ENTORNO, { usuarios });
  assert.equal(dentro.estado, 200);
  assert.deepEqual(dentro.cuerpo, { usuario: 'Ana López', rol: 'vendedor' });

  const fuera = atenderLogin({ usuario: 'Bryan Barboza', password: 'lo-que-sea' }, ENTORNO, { usuarios });
  assert.equal(fuera.estado, 401);
});
