// Usuarios de la herramienta, guardados en la tabla `usuarios` del Supabase de
// Dinamo (supabase/usuarios.sql). El panel de /admin los da de alta, cambia y
// borra; el login y las sesiones los leen de aquí.
//
// Mientras la tabla no exista (o Supabase no responda) se usan los usuarios de
// respaldo de _sesion.js, para que nadie se quede fuera.
//
// El archivo empieza con guion bajo para que Vercel no lo publique como ruta.

import { randomBytes, scryptSync } from 'node:crypto';

import { conexion } from './_base.js';
import { USUARIOS, normalizar } from './_sesion.js';

export const MIN_PASSWORD = 8;

/** Hash scrypt con sal, en el mismo formato que `coincideHash` de _sesion.js. */
export function hashearPassword(password) {
  const sal = randomBytes(16);
  const hash = scryptSync(String(password), sal, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt:16384:8:1:${sal.toString('base64url')}:${hash.toString('base64url')}`;
}

/** Los usuarios que pueden entrar ahora: `[{ nombre, rol, hash }]`. Nunca lanza. */
export async function cargarUsuarios(variables = {}, traer = fetch) {
  const acceso = conexion(variables);
  if (!acceso) return USUARIOS;
  try {
    const respuesta = await traer(`${acceso.base}/rest/v1/usuarios?select=nombre,rol,hash&activo=eq.true`, {
      headers: acceso.cabeceras,
    });
    if (!respuesta.ok) return USUARIOS;
    const filas = await respuesta.json();
    return Array.isArray(filas) && filas.length ? filas : USUARIOS;
  } catch {
    return USUARIOS;
  }
}

const fallo = (estado, message, codigo) => ({ estado, cuerpo: { error: { message, codigo } } });

const SIN_BASE = fallo(503, 'Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el servidor.', 'SIN_BASE');
const SIN_TABLA = fallo(
  503,
  'La tabla de usuarios no existe todavía. Corre supabase/usuarios.sql en el SQL Editor de Supabase.',
  'SIN_TABLA',
);

const CAMPOS = 'id,nombre,rol,activo,creado';

async function pedir(acceso, ruta, opciones, traer) {
  const respuesta = await traer(`${acceso.base}/rest/v1/${ruta}`, {
    ...opciones,
    headers: { ...acceso.cabeceras, ...opciones?.headers },
  });
  if (respuesta.ok) {
    return { ok: true, datos: respuesta.status === 204 ? null : await respuesta.json().catch(() => null) };
  }
  const texto = await respuesta.text().catch(() => '');
  return { ok: false, estado: respuesta.status, texto };
}

function falloDeBase(r) {
  if (r.estado === 404 || /PGRST205|does not exist/.test(r.texto ?? '')) return SIN_TABLA;
  if (r.estado === 409 || /23505/.test(r.texto ?? '')) {
    return fallo(409, 'Ya existe un usuario con ese nombre.', 'DUPLICADO');
  }
  return fallo(502, `Supabase respondió ${r.estado}.`, 'BASE');
}

function nombreValido(nombre) {
  const limpio = String(nombre ?? '').trim().replace(/\s+/g, ' ');
  return limpio.length >= 2 && limpio.length <= 60 ? limpio : null;
}

const NOMBRE_MAL = 'El nombre debe tener entre 2 y 60 caracteres.';
const passwordCorta = () => fallo(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`, 'PASSWORD');

export async function listarUsuarios(variables, traer = fetch) {
  const acceso = conexion(variables);
  if (!acceso) return SIN_BASE;
  const r = await pedir(acceso, `usuarios?select=${CAMPOS}&order=rol.asc,nombre.asc`, {}, traer);
  return r.ok ? { estado: 200, cuerpo: { usuarios: r.datos ?? [] } } : falloDeBase(r);
}

/** Alta de un vendedor. Los administradores no se crean desde el panel. */
export async function crearUsuario(datos, variables, traer = fetch) {
  const acceso = conexion(variables);
  if (!acceso) return SIN_BASE;
  const nombre = nombreValido(datos?.nombre);
  if (!nombre) return fallo(400, NOMBRE_MAL, 'NOMBRE');
  if (String(datos?.password ?? '').length < MIN_PASSWORD) return passwordCorta();
  const r = await pedir(
    acceso,
    `usuarios?select=${CAMPOS}`,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        nombre,
        nombre_clave: normalizar(nombre),
        rol: 'vendedor',
        hash: hashearPassword(datos.password),
      }),
    },
    traer,
  );
  return r.ok ? { estado: 201, cuerpo: { usuario: r.datos?.[0] } } : falloDeBase(r);
}

async function buscar(acceso, id, traer) {
  const r = await pedir(acceso, `usuarios?select=${CAMPOS}&id=eq.${encodeURIComponent(id)}`, {}, traer);
  return r.ok ? { ok: true, usuario: r.datos?.[0] ?? null } : r;
}

/** Cambia nombre, contraseña o estado. El rol no se toca; un admin no se desactiva. */
export async function actualizarUsuario(id, datos, variables, traer = fetch) {
  const acceso = conexion(variables);
  if (!acceso) return SIN_BASE;
  const actual = await buscar(acceso, id, traer);
  if (!actual.ok) return falloDeBase(actual);
  if (!actual.usuario) return fallo(404, 'Ese usuario no existe.', 'NO_EXISTE');

  const cambio = {};
  if (datos?.nombre !== undefined) {
    const nombre = nombreValido(datos.nombre);
    if (!nombre) return fallo(400, NOMBRE_MAL, 'NOMBRE');
    cambio.nombre = nombre;
    cambio.nombre_clave = normalizar(nombre);
  }
  if (datos?.password) {
    if (String(datos.password).length < MIN_PASSWORD) return passwordCorta();
    cambio.hash = hashearPassword(datos.password);
  }
  if (datos?.activo !== undefined) {
    if (actual.usuario.rol === 'admin' && !datos.activo) {
      return fallo(400, 'El administrador no se puede desactivar.', 'ADMIN');
    }
    cambio.activo = Boolean(datos.activo);
  }
  if (!Object.keys(cambio).length) return fallo(400, 'No hay nada que cambiar.', 'VACIO');

  const r = await pedir(
    acceso,
    `usuarios?select=${CAMPOS}&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...cambio, actualizado: new Date().toISOString() }),
    },
    traer,
  );
  if (!r.ok) return falloDeBase(r);

  // El consumo guardado va por nombre: se renombra también para no partir su historia.
  if (cambio.nombre && cambio.nombre !== actual.usuario.nombre) {
    await pedir(
      acceso,
      `gemini_uso?usuario=eq.${encodeURIComponent(actual.usuario.nombre)}`,
      { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ usuario: cambio.nombre }) },
      traer,
    ).catch(() => {});
  }
  return { estado: 200, cuerpo: { usuario: r.datos?.[0] } };
}

export async function borrarUsuario(id, variables, traer = fetch) {
  const acceso = conexion(variables);
  if (!acceso) return SIN_BASE;
  const actual = await buscar(acceso, id, traer);
  if (!actual.ok) return falloDeBase(actual);
  if (!actual.usuario) return fallo(404, 'Ese usuario no existe.', 'NO_EXISTE');
  if (actual.usuario.rol === 'admin') return fallo(400, 'El administrador no se puede borrar.', 'ADMIN');
  const r = await pedir(
    acceso,
    `usuarios?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
    traer,
  );
  return r.ok ? { estado: 200, cuerpo: { ok: true } } : falloDeBase(r);
}
