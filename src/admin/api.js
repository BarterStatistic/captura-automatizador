// Llamadas del panel de /admin al servidor. Todas llevan la cookie de sesión y
// solo las atiende un administrador (api/_admin.js).

export class ErrorAdmin extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

async function pedir(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...opciones,
      headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new ErrorAdmin('No se pudo contactar al servidor. Revisa la conexión a internet.', 0);
  }
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new ErrorAdmin(cuerpo?.error?.message ?? `Error ${respuesta.status}.`, respuesta.status);
  return cuerpo;
}

export const balanceDe = (periodo) => pedir(`/api/admin?periodo=${encodeURIComponent(periodo)}`);

export const listarUsuarios = () => pedir('/api/usuarios');
export const crearUsuario = (datos) => pedir('/api/usuarios', { method: 'POST', body: JSON.stringify(datos) });
export const cambiarUsuario = (id, datos) =>
  pedir(`/api/usuarios?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(datos) });
export const borrarUsuario = (id) => pedir(`/api/usuarios?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
