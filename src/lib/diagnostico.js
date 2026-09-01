// Traduce los fallos de Gemini a algo que se pueda actuar.
//
// El navegador, cuando no logra completar la petición, entrega un escueto
// «Failed to fetch» sin código ni motivo. Ese texto es inútil para quien está
// capturando: no distingue una clave restringida por dominio de una red que
// bloquea googleapis. Aquí se convierte en las causas concretas que hay que
// revisar, en el orden en que conviene revisarlas.

/** Saca el `error.message` que manda Google, que suele ser el dato concreto. */
function mensajeDeGoogle(cuerpo) {
  try {
    return JSON.parse(cuerpo)?.error?.message ?? '';
  } catch {
    return '';
  }
}

/**
 * La petición no llegó a completarse: no hay código de estado que interpretar.
 *
 * Google rechaza una clave restringida por referrer con un 403 que NO lleva
 * cabeceras CORS, y el navegador convierte eso en «Failed to fetch». Por eso la
 * restricción de dominio va primero: es la causa más común y la que más se
 * confunde con un problema de red.
 */
export function explicarFalloDeRed(error, origen) {
  return [
    `El navegador no pudo contactar a Gemini desde ${origen} (${error.message}).`,
    'La petición ni siquiera llegó a enviarse, así que no es un problema de la',
    'app. Revisa, en este orden:',
    '',
    `1. Que tu API key no esté restringida a otros dominios. En Google Cloud →`,
    `   Credenciales → tu clave → «Restricciones de sitio web», agrega`,
    `   ${origen}/*  (o quita la restricción para probar). Una clave restringida`,
    '   se rechaza sin cabeceras CORS, y el navegador lo muestra así.',
    '2. Que la red por la que navegas no bloquee googleapis.com. Las redes de',
    '   oficina suelen filtrarlo; si estás en la de la agencia, prueba con',
    '   datos del celular.',
    '3. Que no haya un bloqueador de anuncios o extensión de privacidad',
    '   cortando la petición. Prueba en una ventana de incógnito.',
  ].join('\n');
}

/** Gemini sí respondió, pero con un error. El código dice qué revisar. */
export function explicarRespuesta(estado, cuerpo) {
  const deGoogle = mensajeDeGoogle(cuerpo);
  const cola = deGoogle ? ` Google dice: «${deGoogle}».` : '';

  if (estado === 400) {
    return (
      `Gemini rechazó la petición (400). Casi siempre es la API key mal copiada: ` +
      `revisa que no tenga espacios ni le falten caracteres.${cola}`
    );
  }

  if (estado === 403) {
    return (
      `Gemini denegó el acceso (403). La clave puede estar restringida a otros ` +
      `dominios, o la API «Generative Language» no está habilitada en tu ` +
      `proyecto de Google Cloud.${cola}`
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
      `Gemini tuvo un problema en su servidor (${estado}). No es tu clave: ` +
      `inténtalo de nuevo en un momento.${cola}`
    );
  }

  return `Gemini respondió ${estado}.${cola || ` ${String(cuerpo).slice(0, 200)}`}`;
}

/**
 * Comprueba de una vez si la clave y la red sirven, sin gastar un documento.
 * Devuelve `{ ok, mensaje }`.
 */
export async function probarConexion(url, apiKey) {
  const origen = window.location.origin;

  if (!apiKey) {
    return { ok: false, mensaje: 'Todavía no has configurado la API key.' };
  }

  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
    });
  } catch (error) {
    return { ok: false, mensaje: explicarFalloDeRed(error, origen) };
  }

  if (respuesta.ok) {
    return { ok: true, mensaje: 'La clave funciona y hay conexión con Gemini.' };
  }

  return { ok: false, mensaje: explicarRespuesta(respuesta.status, await respuesta.text()) };
}
