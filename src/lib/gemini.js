// Cliente de Gemini 2.5 Flash para leer imágenes y PDF.
//
// Adaptado de `marga-1.5/src/lib/buro/ocr.js`, con dos diferencias:
//
//   - Acepta PDF además de imágenes, porque los estados de cuenta llegan así.
//     Un PDF no se puede reescalar con <canvas>, así que se manda tal cual.
//   - La API key NO viaja en el bundle. La app se publica en GitHub Pages, que
//     es público, y una key compilada la podría gastar cualquiera. Se pide una
//     vez y vive en localStorage de cada navegador.

const MODELO = 'gemini-2.5-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
const LADO_MAXIMO = 1600; // acota el costo sin perder legibilidad de la CURP
const CALIDAD_JPEG = 0.88;

export const CLAVE_ALMACEN = 'captura_automatizador_gemini_key';

/** La lectura falló: formato, red, o una respuesta que no se pudo entender. */
export class ErrorGemini extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorGemini';
  }
}

/** Arma el cuerpo de la petición: el prompt y el archivo van juntos. */
export function construirCuerpo(prompt, esquema, archivo) {
  return {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: archivo.mime, data: archivo.datos } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: esquema,
    },
  };
}

/**
 * Saca el objeto extraído de la respuesta cruda de Gemini.
 *
 * Las cadenas vacías o de puros espacios se vuelven null: la app pinta en rojo
 * lo que falta, y un "" que se cuela como dato válido se capturaría en blanco
 * sin que nadie lo note.
 */
export function interpretarRespuesta(textoCrudo) {
  let lectura;
  try {
    const sobre = JSON.parse(textoCrudo);
    lectura = JSON.parse(sobre.candidates[0].content.parts[0].text);
  } catch {
    throw new ErrorGemini(`Respuesta de Gemini inesperada: ${String(textoCrudo).slice(0, 300)}`);
  }

  return Object.fromEntries(
    Object.entries(lectura).map(([clave, valor]) => {
      if (typeof valor !== 'string') return [clave, valor ?? null];
      const limpio = valor.trim();
      return [clave, limpio || null];
    }),
  );
}

/**
 * Reduce la imagen si es enorme. Los PDF se devuelven intactos: no se pueden
 * decodificar con createImageBitmap y Gemini los lee bien de todos modos.
 */
async function reducir(archivo) {
  if (archivo.type === 'application/pdf') return archivo;

  let bitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    return archivo;
  }

  const lado = Math.max(bitmap.width, bitmap.height);
  if (lado <= LADO_MAXIMO) {
    bitmap.close?.();
    return archivo;
  }

  const proporcion = LADO_MAXIMO / lado;
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bitmap.width * proporcion);
  lienzo.height = Math.round(bitmap.height * proporcion);

  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close?.();

  const blob = await new Promise((resolver) =>
    lienzo.toBlob(resolver, 'image/jpeg', CALIDAD_JPEG),
  );
  return blob ?? archivo;
}

/** Base64 sin el prefijo `data:`, que es lo que espera `inline_data`. */
function aBase64(blob) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result).split(',')[1] ?? '');
    lector.onerror = () => rechazar(new ErrorGemini('No se pudo leer el archivo.'));
    lector.readAsDataURL(blob);
  });
}

/** La API key que el capturista guardó en este navegador. */
export function apiKeyGuardada() {
  try {
    return localStorage.getItem(CLAVE_ALMACEN) ?? '';
  } catch {
    return '';
  }
}

export function guardarApiKey(clave) {
  localStorage.setItem(CLAVE_ALMACEN, String(clave ?? '').trim());
}

/**
 * Lee un documento con Gemini y devuelve el objeto que describe su esquema.
 * `documento` es una entrada de DOCUMENTOS; `archivo` es el File del input.
 */
export async function leerDocumento(documento, archivo) {
  const apiKey = apiKeyGuardada();
  if (!apiKey) {
    throw new ErrorGemini(
      'Falta la API key de Gemini. Consíguela en https://aistudio.google.com/apikey ' +
        'y guárdala en el botón de configuración.',
    );
  }
  if (!archivo?.size) throw new ErrorGemini('El archivo llegó vacío.');

  const reducido = await reducir(archivo);
  const cuerpo = construirCuerpo(documento.prompt, documento.esquema, {
    mime: reducido.type || archivo.type,
    datos: await aBase64(reducido),
  });

  let respuesta;
  try {
    respuesta = await fetch(URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } catch (exc) {
    throw new ErrorGemini(`No se pudo contactar a Gemini: ${exc.message}`);
  }

  const texto = await respuesta.text();
  if (!respuesta.ok) {
    throw new ErrorGemini(`Gemini respondió ${respuesta.status}: ${texto.slice(0, 300)}`);
  }

  return interpretarRespuesta(texto);
}
