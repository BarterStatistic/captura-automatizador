// Reenvío a Gemini desde el servidor.
//
// La API key vive en la variable de entorno GEMINI_API_KEY y nunca llega al
// navegador: la página manda el cuerpo de la petición a /api/gemini y este
// módulo le agrega la clave. Lo usan dos lugares con el mismo código:
//
//   - api/gemini.js, la función de Vercel en producción.
//   - vite.config.js, el middleware de `npm run dev`, que lee .env.local.
//
// El archivo empieza con guion bajo para que Vercel no lo publique como ruta.

export const MODELO_POR_DEFECTO = 'gemini-2.5-flash';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function respuestaDeError(estado, mensaje, codigo) {
  return { estado, texto: JSON.stringify({ error: { message: mensaje, codigo } }) };
}

/**
 * Manda `cuerpo` (una petición generateContent ya armada) a Gemini.
 *
 * Devuelve `{ estado, texto }` con la respuesta de Google tal cual, para que la
 * página la interprete igual que si hubiera llamado directo. `entorno` trae
 * `apiKey`, `modelo` y opcionalmente `fetch`, que las pruebas sustituyen.
 */
export async function reenviarAGemini(cuerpo, entorno = {}) {
  const apiKey = String(entorno.apiKey ?? '').trim();
  if (!apiKey) {
    return respuestaDeError(
      500,
      'Falta GEMINI_API_KEY en el servidor. En local ponla en .env.local y reinicia ' +
        '`npm run dev`; en Vercel agrégala en Settings → Environment Variables y vuelve a desplegar.',
      'SIN_CLAVE',
    );
  }

  if (!cuerpo || typeof cuerpo !== 'object' || !Array.isArray(cuerpo.contents)) {
    return respuestaDeError(400, 'La petición no trae `contents`.', 'CUERPO_INVALIDO');
  }

  const modelo = String(entorno.modelo ?? '').trim() || MODELO_POR_DEFECTO;
  const traer = entorno.fetch ?? fetch;

  let respuesta;
  try {
    respuesta = await traer(`${BASE}/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } catch (error) {
    return respuestaDeError(
      502,
      `El servidor no pudo contactar a Gemini: ${error.message}`,
      'SIN_RED_SERVIDOR',
    );
  }

  return { estado: respuesta.status, texto: await respuesta.text() };
}

/** Lo que el servidor necesita del entorno, leído de un objeto tipo process.env. */
export function entornoDesde(variables) {
  return { apiKey: variables.GEMINI_API_KEY, modelo: variables.GEMINI_MODEL };
}
