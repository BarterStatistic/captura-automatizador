// Lo que atiende /admin: el balance de consumo y el gestor de usuarios. Solo
// para el administrador; cualquier otro recibe 401 o 403 sin una sola cifra.
// Lo usan api/admin.js, api/usuarios.js y el middleware de vite.
//
// El archivo empieza con guion bajo para que Vercel no lo publique como ruta.

import { conexion } from './_base.js';
import { PERIODOS, rangoDe, rpc } from './_gasto.js';
import { RESPUESTA_SIN_SESION, leerSesion, rolDe, secretoDe, tokenDeCookies } from './_sesion.js';
import { actualizarUsuario, borrarUsuario, cargarUsuarios, crearUsuario, listarUsuarios } from './_usuarios.js';

/** `{ estado, cuerpo }` de rechazo si la petición no es de un admin; null si pasa. */
async function exigirAdmin(cabeceraCookie, variables, traer) {
  const usuarios = await cargarUsuarios(variables, traer);
  const usuario = leerSesion(tokenDeCookies(cabeceraCookie), secretoDe(variables), Date.now(), usuarios);
  if (!usuario) return { estado: 401, cuerpo: JSON.parse(RESPUESTA_SIN_SESION) };
  if (rolDe(usuario, usuarios) !== 'admin') {
    return { estado: 403, cuerpo: { error: { message: 'No tienes permiso para ver esto.', codigo: 'SIN_PERMISO' } } };
  }
  return null;
}

/** GET /api/admin?periodo=dia|semana|mes|trimestre */
export async function atenderPanel(cabeceraCookie, url, variables = {}, ahora = new Date(), traer = fetch) {
  const rechazo = await exigirAdmin(cabeceraCookie, variables, traer);
  if (rechazo) return rechazo;

  const periodo = new URL(url ?? '/', 'http://local').searchParams.get('periodo') || 'mes';
  if (!PERIODOS.includes(periodo)) {
    return { estado: 400, cuerpo: { error: { message: 'Periodo no válido.', codigo: 'PERIODO' } } };
  }
  const acceso = conexion(variables);
  if (!acceso) {
    return {
      estado: 503,
      cuerpo: { error: { message: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el servidor.', codigo: 'SIN_BASE' } },
    };
  }
  const rango = rangoDe(periodo, ahora);
  try {
    const [resumen, serie, usuarios] = await Promise.all([
      rpc(acceso, 'admin_resumen', { desde: rango.desde }, traer),
      rpc(acceso, 'gemini_serie', rango, traer),
      cargarUsuarios(variables, traer),
    ]);
    // Los vendedores sin una sola captura también aparecen, en ceros.
    const conConsumo = new Set((resumen.por_usuario ?? []).map((fila) => fila.usuario));
    const sinConsumo = usuarios
      .filter((u) => u.rol !== 'admin' && !conConsumo.has(u.nombre))
      .map((u) => ({ usuario: u.nombre, llamadas: 0, capturas: 0, usd: 0, tipo_favorito: null }));
    return {
      estado: 200,
      cuerpo: {
        periodo,
        ...rango,
        ...resumen,
        por_usuario: [...(resumen.por_usuario ?? []), ...sinConsumo],
        serie: serie ?? [],
      },
    };
  } catch (excepcion) {
    return {
      estado: 502,
      cuerpo: {
        error: {
          message: `${excepcion.message} Si es la primera vez, corre supabase/usuarios.sql en Supabase.`,
          codigo: 'BASE',
        },
      },
    };
  }
}

/** /api/usuarios: GET lista, POST alta, PATCH ?id= cambia, DELETE ?id= borra. */
export async function atenderUsuarios(metodo, cabeceraCookie, url, cuerpo, variables = {}, traer = fetch) {
  const rechazo = await exigirAdmin(cabeceraCookie, variables, traer);
  if (rechazo) return rechazo;

  const id = new URL(url ?? '/', 'http://local').searchParams.get('id');
  if (metodo === 'GET') return listarUsuarios(variables, traer);
  if (metodo === 'POST') return crearUsuario(cuerpo, variables, traer);
  if (metodo === 'PATCH' || metodo === 'DELETE') {
    if (!/^\d+$/.test(String(id ?? ''))) {
      return { estado: 400, cuerpo: { error: { message: 'Falta el id del usuario.', codigo: 'ID' } } };
    }
    return metodo === 'PATCH' ? actualizarUsuario(id, cuerpo, variables, traer) : borrarUsuario(id, variables, traer);
  }
  return { estado: 405, cuerpo: { error: { message: 'Método no permitido.', codigo: 'METODO' } } };
}
