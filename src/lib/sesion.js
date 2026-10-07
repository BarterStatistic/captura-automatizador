// La sesión desde el navegador. La cookie es HttpOnly: la página no la ve, solo
// pregunta al servidor si hay sesión (api/_sesion.js).

// Se avisa a la pantalla de acceso cuando el servidor dice que la sesión venció
// a media captura (un 401 de /api/gemini).
export const EVENTO_SESION_VENCIDA = 'captura:sesion-vencida';

/** El nombre del usuario con sesión abierta, o null. */
export async function sesionActual() {
  try {
    const respuesta = await fetch('/api/sesion', { credentials: 'same-origin', cache: 'no-store' });
    if (!respuesta.ok) return null;
    return (await respuesta.json()).usuario ?? null;
  } catch {
    return null;
  }
}

/** Entra con usuario y contraseña. Devuelve el nombre; si falla, lanza Error con el motivo. */
export async function entrar(usuario, password) {
  let respuesta;
  try {
    respuesta = await fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password }),
    });
  } catch {
    throw new Error('No se pudo contactar al servidor. Revisa la conexión a internet.');
  }
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(cuerpo?.error?.message ?? `El servidor respondió ${respuesta.status}.`);
  return cuerpo.usuario;
}

export async function salir() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // Aunque falle la red, la pantalla vuelve al acceso; la cookie vence sola.
  }
}

export function avisarSesionVencida() {
  window.dispatchEvent(new Event(EVENTO_SESION_VENCIDA));
}
