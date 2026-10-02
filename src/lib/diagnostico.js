// Traduce los fallos de Gemini a algo que se pueda actuar.
//
// La página no habla con Google: habla con /api/gemini, que tiene la clave. Así
// que hay dos tramos que pueden fallar y conviene distinguirlos:
//
//   - El navegador no llega a /api/gemini → «Failed to fetch», sin código.
//   - /api/gemini sí responde, pero con el error que le dio Google (o con uno
//     propio, como la clave faltante, que trae `codigo`).

/** Saca `error.message` y `error.codigo` del cuerpo, si es JSON. */
function errorDelCuerpo(cuerpo) {
  try {
    const error = JSON.parse(cuerpo)?.error ?? {};
    return { mensaje: error.message ?? '', codigo: error.codigo ?? '' };
  } catch {
    return { mensaje: '', codigo: '' };
  }
}

/** La petición a /api/gemini no llegó a completarse: no hay código que leer. */
export function explicarFalloDeRed(error, origen) {
  return [
    `El navegador no pudo contactar al servidor de la app en ${origen} (${error.message}).`,
    'Revisa, en este orden:',
    '',
    '1. Que haya internet en esta computadora.',
    '2. Que la red de la agencia no bloquee el dominio de la app (*.vercel.app).',
    '   Si sospechas eso, prueba con datos del celular.',
    '3. Que no haya un bloqueador de anuncios o extensión de privacidad',
    '   cortando la petición. Prueba en una ventana de incógnito.',
  ].join('\n');
}

/** El servidor respondió con error. El código dice qué revisar. */
export function explicarRespuesta(estado, cuerpo) {
  const { mensaje, codigo } = errorDelCuerpo(cuerpo);

  // Los errores propios del servidor ya vienen redactados para el usuario.
  if (codigo === 'SIN_CLAVE') return mensaje;

  const cola = mensaje ? ` Google dice: «${mensaje}».` : '';

  if (estado === 400) {
    return (
      `Gemini rechazó la petición (400). Casi siempre es la GEMINI_API_KEY mal copiada: ` +
      `revisa que no tenga espacios ni le falten caracteres.${cola}`
    );
  }

  if (estado === 403) {
    return (
      `Gemini denegó el acceso (403). Si la clave tiene «Restricciones de sitio web», ` +
      `quítalas: ahora la usa el servidor, que no manda dominio. También puede ser que ` +
      `la API «Generative Language» no esté habilitada en el proyecto.${cola}`
    );
  }

  if (estado === 413) {
    return (
      'El archivo es demasiado grande para mandarlo (413). Si es un PDF, mándalo como ' +
      'fotos de las páginas o comprímelo por debajo de 3 MB.'
    );
  }

  if (estado === 429) {
    return (
      `Se agotó la cuota de la clave (429). Espera un momento o revisa el ` +
      `límite diario en Google Cloud.${cola}`
    );
  }

  if (estado >= 500) {
    return (
      `Gemini tuvo un problema en su servidor (${estado}). No es la clave: ` +
      `inténtalo de nuevo en un momento.${cola}`
    );
  }

  return `Gemini respondió ${estado}.${cola || ` ${String(cuerpo).slice(0, 200)}`}`;
}

/**
 * Comprueba de una vez si el servidor tiene clave y llega a Gemini, sin gastar
 * un documento. Devuelve `{ ok, mensaje }`.
 */
export async function probarConexion(url) {
  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'ping' }] }],
        generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
  } catch (error) {
    return { ok: false, mensaje: explicarFalloDeRed(error, window.location.origin) };
  }

  if (respuesta.ok) {
    return { ok: true, mensaje: 'El servidor tiene la clave y hay conexión con Gemini.' };
  }

  return { ok: false, mensaje: explicarRespuesta(respuesta.status, await respuesta.text()) };
}
