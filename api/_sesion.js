// Inicio de sesión del lado del servidor.
//
// Sin sesión no se entra a la página ni se llama a /api/gemini: así nadie que
// encuentre la URL gasta la cuota de Gemini. Lo usan las funciones de Vercel
// (api/login.js, api/logout.js, api/sesion.js, api/gemini.js) y el middleware
// de `npm run dev` en vite.config.js, con el mismo código.
//
// La sesión es una cookie HttpOnly firmada con HMAC: el navegador no la puede
// leer ni falsificar, y el servidor no guarda nada (Vercel no tiene memoria
// entre llamadas).
//
// El archivo empieza con guion bajo para que Vercel no lo publique como ruta.

import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

// Un solo usuario por ahora (pedido de Braulio, 2026-10-06). El repositorio es
// público, así que la contraseña no está escrita: solo su hash scrypt con sal.
// Para cambiarla, generar otro con:
//   node -e "const c=require('crypto');const s=c.randomBytes(16);console.log('scrypt:16384:8:1:'+s.toString('base64url')+':'+c.scryptSync('NUEVA',s,32,{N:16384,r:8,p:1}).toString('base64url'))"
export const USUARIOS = [
  {
    nombre: 'Braulio Acosta',
    hash: 'scrypt:16384:8:1:YTTxj54n8lToBaHTVyuEMg:2Npkh56GC1IOU5NQ5FkxEWb0XB5IWY8W8lpPmZCKKZg',
  },
];

export const COOKIE = 'captura_sesion';
// Una jornada de la agencia; después hay que volver a entrar.
export const DURACION_MS = 12 * 60 * 60 * 1000;

const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

function coincideHash(password, hash) {
  const [tipo, N, r, p, sal, esperado] = String(hash).split(':');
  if (tipo !== 'scrypt') return false;
  const esperadoBytes = Buffer.from(esperado, 'base64url');
  const calculado = scryptSync(String(password ?? ''), Buffer.from(sal, 'base64url'), esperadoBytes.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(calculado, esperadoBytes);
}

/**
 * El nombre del usuario si la contraseña es la suya; null si no. El nombre se
 * compara sin mayúsculas, acentos ni espacios de más.
 */
export function verificarCredenciales(usuario, password, usuarios = USUARIOS) {
  const buscado = normalizar(usuario);
  const encontrado = usuarios.find((u) => normalizar(u.nombre) === buscado);
  // Sin usuario se calcula igual un hash, para no delatar por el tiempo de
  // respuesta qué nombres existen.
  const hash = encontrado?.hash ?? usuarios[0]?.hash;
  const ok = hash ? coincideHash(password, hash) : false;
  return encontrado && ok ? encontrado.nombre : null;
}

/**
 * Con qué se firman las cookies: SESION_SECRETO si existe; si no, uno derivado
 * de GEMINI_API_KEY, que el servidor ya tiene y nunca sale de él. Cambiar
 * cualquiera de las dos cierra todas las sesiones.
 */
export function secretoDe(variables = {}) {
  const propio = String(variables.SESION_SECRETO ?? '').trim();
  if (propio) return propio;
  const clave = String(variables.GEMINI_API_KEY ?? '').trim();
  if (!clave) return '';
  return createHmac('sha256', clave).update('captura-automatizador:sesion').digest('base64url');
}

const firma = (datos, secreto) => createHmac('sha256', secreto).update(datos).digest('base64url');

export function crearSesion(nombre, secreto, ahora = Date.now()) {
  const datos = Buffer.from(JSON.stringify({ u: nombre, exp: ahora + DURACION_MS })).toString('base64url');
  return `${datos}.${firma(datos, secreto)}`;
}

/** El nombre del usuario de una sesión válida y vigente; null si no. */
export function leerSesion(token, secreto, ahora = Date.now()) {
  if (!token || !secreto) return null;
  const [datos, sello] = String(token).split('.');
  if (!datos || !sello) return null;
  const esperado = Buffer.from(firma(datos, secreto));
  const recibido = Buffer.from(sello);
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'));
    if (typeof u !== 'string' || !(Number(exp) > ahora)) return null;
    // Si el usuario se borra de la lista, su sesión deja de valer.
    return USUARIOS.some((usuario) => usuario.nombre === u) ? u : null;
  } catch {
    return null;
  }
}

/** El valor de la cookie de sesión dentro de la cabecera Cookie. */
export function tokenDeCookies(cabecera) {
  for (const parte of String(cabecera ?? '').split(';')) {
    const [nombre, ...resto] = parte.trim().split('=');
    if (nombre === COOKIE) return decodeURIComponent(resto.join('='));
  }
  return '';
}

/** Set-Cookie para guardar la sesión; `segura` solo en https (Vercel). */
export function cookieDeSesion(token, segura) {
  return [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(DURACION_MS / 1000)}`,
    segura && 'Secure',
  ]
    .filter(Boolean)
    .join('; ');
}

export function cookieBorrada(segura) {
  return [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', segura && 'Secure']
    .filter(Boolean)
    .join('; ');
}

const SIN_SECRETO = {
  estado: 500,
  cuerpo: {
    error: {
      message: 'El servidor no tiene con qué firmar la sesión: falta GEMINI_API_KEY (o SESION_SECRETO).',
      codigo: 'SIN_SECRETO',
    },
  },
};

/**
 * POST /api/login con `{ usuario, password }`. Devuelve `{ estado, cuerpo,
 * cookie }`; `cookie` es lo que va en Set-Cookie cuando entra.
 */
export function atenderLogin(cuerpo, variables, { segura = false, ahora = Date.now() } = {}) {
  const secreto = secretoDe(variables);
  if (!secreto) return SIN_SECRETO;
  const nombre = verificarCredenciales(cuerpo?.usuario, cuerpo?.password);
  if (!nombre) {
    return {
      estado: 401,
      cuerpo: { error: { message: 'Usuario o contraseña incorrectos.', codigo: 'CREDENCIALES' } },
    };
  }
  return {
    estado: 200,
    cuerpo: { usuario: nombre },
    cookie: cookieDeSesion(crearSesion(nombre, secreto, ahora), segura),
  };
}

/** GET /api/sesion: quién tiene la sesión abierta, o 401. */
export function atenderSesion(cabeceraCookie, variables, ahora = Date.now()) {
  const nombre = leerSesion(tokenDeCookies(cabeceraCookie), secretoDe(variables), ahora);
  return nombre
    ? { estado: 200, cuerpo: { usuario: nombre } }
    : { estado: 401, cuerpo: { error: { message: 'No hay sesión.', codigo: 'SIN_SESION' } } };
}

/** Para /api/gemini: ¿la petición trae una sesión válida? */
export function haySesion(cabeceraCookie, variables, ahora = Date.now()) {
  return Boolean(leerSesion(tokenDeCookies(cabeceraCookie), secretoDe(variables), ahora));
}

export const RESPUESTA_SIN_SESION = JSON.stringify({
  error: { message: 'Tu sesión venció. Vuelve a entrar.', codigo: 'SIN_SESION' },
});

/** En Vercel la petición llega por https detrás de su proxy. */
export function esSegura(cabeceras = {}) {
  return String(cabeceras['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
}
