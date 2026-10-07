// Cliente de Gemini para leer imágenes, PDF y texto.
//
// La página nunca ve la API key: arma la petición y la manda a /api/gemini,
// que le agrega la clave del entorno (api/_proxy.js). En Vercel lo atiende una
// función; en `npm run dev`, un middleware de vite.config.js.
//
// Adaptado de `marga-1.5/src/lib/buro/ocr.js`. Acepta PDF además de imágenes,
// porque los estados de cuenta llegan así; un PDF no se puede reescalar con
// <canvas>, así que se manda tal cual.

import { explicarFalloDeRed, explicarRespuesta } from './diagnostico.js';
import { avisarSesionVencida } from './sesion.js';

export const URL_API = '/api/gemini';

const LADO_MAXIMO = 1600; // acota el costo sin perder legibilidad de la CURP
const CALIDAD_JPEG = 0.88;

// Vercel corta las peticiones a funciones en 4.5 MB. El base64 pesa 4/3 del
// archivo, así que un PDF de más de ~3.2 MB no cabe. Se avisa antes de mandar.
const LIMITE_BASE64 = 4_300_000;

/** La lectura falló: formato, red, o una respuesta que no se pudo entender. */
export class ErrorGemini extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorGemini';
  }
}

/**
 * Arma el cuerpo de la petición. `archivo` es opcional: el formulario del
 * vendedor se manda como texto dentro del prompt.
 *
 * `pensar: false` apaga el razonamiento del modelo. Sirve para tareas cortas
 * (clasificar, transcribir un texto) donde solo agrega espera.
 */
export function construirCuerpo(prompt, esquema, archivo, { pensar = true } = {}) {
  const partes = [{ text: prompt }];
  if (archivo) partes.push({ inline_data: { mime_type: archivo.mime, data: archivo.datos } });

  const generationConfig = {
    temperature: 0,
    responseMimeType: 'application/json',
    responseSchema: esquema,
  };
  if (!pensar) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  return { contents: [{ parts: partes }], generationConfig };
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

// Un mismo archivo se manda dos veces (clasificar y leer, o los dos lados de
// una INE en una sola foto). Reducir y codificar se hace una vez por archivo.
const preparados = new WeakMap();

function preparar(archivo) {
  if (!preparados.has(archivo)) {
    const promesa = (async () => {
      if (!archivo?.size) throw new ErrorGemini('El archivo llegó vacío.');
      const reducido = await reducir(archivo);
      const datos = await aBase64(reducido);
      if (datos.length > LIMITE_BASE64) {
        const mb = (archivo.size / 1024 / 1024).toFixed(1);
        throw new ErrorGemini(
          `${archivo.name || 'El archivo'} pesa ${mb} MB y no cabe en una petición (máximo ` +
            'unos 3 MB). Si es un PDF, mándalo como fotos de las páginas o comprímelo.',
        );
      }
      return { mime: reducido.type || archivo.type, datos };
    })();
    // Si falla, que el siguiente intento vuelva a probar en vez de heredar el error.
    promesa.catch(() => preparados.delete(archivo));
    preparados.set(archivo, promesa);
  }
  return preparados.get(archivo);
}

/** Manda una petición ya armada a /api/gemini y devuelve el objeto leído. */
async function pedir(cuerpo) {
  let respuesta;
  try {
    respuesta = await fetch(URL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } catch (exc) {
    // «Failed to fetch» a secas no dice nada accionable; el diagnóstico sí.
    throw new ErrorGemini(explicarFalloDeRed(exc, window.location.origin));
  }

  const texto = await respuesta.text();
  // Sin sesión (venció a media captura): la pantalla de acceso se vuelve a abrir.
  if (respuesta.status === 401) avisarSesionVencida();
  if (!respuesta.ok) throw new ErrorGemini(explicarRespuesta(respuesta.status, texto));

  return interpretarRespuesta(texto);
}

/**
 * Lee un documento con Gemini y devuelve el objeto que describe su esquema.
 * `documento` es una entrada de DOCUMENTOS; `archivo` es un File.
 */
export async function leerDocumento(documento, archivo) {
  const preparado = await preparar(archivo);
  return pedir(construirCuerpo(documento.prompt, documento.esquema, preparado));
}

/** Pregunta qué documento es. Devuelve el `tipo` crudo de CLASIFICADOR. */
export async function clasificarArchivo(clasificador, archivo) {
  const preparado = await preparar(archivo);
  const lectura = await pedir(
    construirCuerpo(clasificador.prompt, clasificador.esquema, preparado, { pensar: false }),
  );
  return lectura.tipo ?? null;
}

/** Lee un texto pegado (el formulario del vendedor) con el esquema dado. */
export async function leerTexto(lector, texto) {
  const prompt = `${lector.prompt}\n\n--- TEXTO PEGADO ---\n${texto}\n--- FIN ---`;
  return pedir(construirCuerpo(prompt, lector.esquema, null, { pensar: false }));
}
