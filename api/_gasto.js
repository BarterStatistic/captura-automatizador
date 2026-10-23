// Gasto de la API de Gemini.
//
// Cada respuesta de Gemini trae `usageMetadata` con los tokens usados. Aquí se
// convierte en dólares y se guarda una fila por llamada en la tabla
// `gemini_uso` de Supabase (con la llave de servicio, que solo vive en el
// servidor). Lo usan api/gemini.js, api/gasto.js y el middleware de vite.
//
// El archivo empieza con guion bajo para que Vercel no lo publique como ruta.

import { MODELO_POR_DEFECTO } from './_proxy.js';
import { RESPUESTA_SIN_SESION, leerSesion, rolDe, secretoDe, tokenDeCookies } from './_sesion.js';

// USD por millón de tokens (precio estándar de pago de Google, 2026-10-23).
// La salida incluye los tokens de razonamiento. Si cambia el modelo o el
// precio, se corrige aquí.
export const TARIFAS = {
  'gemini-2.5-flash': { entrada: 0.3, salida: 2.5 },
  'gemini-2.5-flash-lite': { entrada: 0.1, salida: 0.4 },
};

const TARIFA_SUPUESTA = TARIFAS['gemini-2.5-flash'];

/** Tokens y costo de la respuesta cruda de Gemini; null si no trae uso. */
export function usoDeRespuesta(texto, modelo) {
  let uso;
  try {
    uso = JSON.parse(texto)?.usageMetadata;
  } catch {
    return null;
  }
  if (!uso || typeof uso !== 'object') return null;

  const entrada = Number(uso.promptTokenCount) || 0;
  const razonamiento = Number(uso.thoughtsTokenCount) || 0;
  const salida = Number(uso.candidatesTokenCount) || 0;
  const tarifa = TARIFAS[modelo] ?? TARIFA_SUPUESTA;
  const costo = (entrada * tarifa.entrada + (salida + razonamiento) * tarifa.salida) / 1_000_000;

  return {
    tokens_entrada: entrada,
    tokens_salida: salida,
    tokens_razonamiento: razonamiento,
    costo_usd: Number(costo.toFixed(6)),
  };
}

function conexion(variables = {}) {
  const llave = String(variables.SUPABASE_SERVICE_KEY ?? '').trim();
  const base = String(variables.SUPABASE_URL ?? '').trim();
  if (!llave || !base) return null;
  return {
    base: base.replace(/\/$/, ''),
    cabeceras: { apikey: llave, Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
  };
}

/**
 * Calcula el gasto de una respuesta de Gemini y lo guarda. Nunca lanza: un
 * fallo al registrar no debe tumbar la lectura del documento. Devuelve el
 * costo en USD (0 si la respuesta no trae uso).
 */
export async function registrarGasto({ estado, texto }, { usuario, captura, modelo }, variables = {}, traer = fetch) {
  const nombreModelo = String(modelo ?? '').trim() || MODELO_POR_DEFECTO;
  const uso = usoDeRespuesta(texto, nombreModelo);
  if (!uso) return 0;

  const acceso = conexion(variables);
  if (!acceso) {
    console.warn('[gasto] Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY: el gasto no se guardó.');
    return uso.costo_usd;
  }

  try {
    const respuesta = await traer(`${acceso.base}/rest/v1/gemini_uso`, {
      method: 'POST',
      headers: { ...acceso.cabeceras, Prefer: 'return=minimal' },
      body: JSON.stringify({
        usuario: usuario ?? null,
        captura_id: String(captura ?? '').slice(0, 64) || null,
        modelo: nombreModelo,
        estado,
        ...uso,
      }),
    });
    if (!respuesta.ok) console.error('[gasto] Supabase respondió', respuesta.status, await respuesta.text());
  } catch (error) {
    console.error('[gasto] No se pudo guardar:', error.message);
  }
  return uso.costo_usd;
}

export const PERIODOS = ['dia', 'semana', 'mes', 'trimestre'];

/**
 * Desde cuándo y con qué paso se grafica cada periodo, en hora de México
 * (UTC-6 todo el año desde 2022). Es el periodo EN CURSO: hoy, esta semana
 * (desde el lunes), este mes o este trimestre natural.
 */
export function rangoDe(periodo, ahora = new Date()) {
  const local = new Date(ahora.getTime() - 6 * 3600_000);
  const anio = local.getUTCFullYear();
  const mes = local.getUTCMonth();
  const dia = local.getUTCDate();

  let inicio;
  let paso;
  if (periodo === 'dia') {
    inicio = Date.UTC(anio, mes, dia);
    paso = 'hour';
  } else if (periodo === 'semana') {
    inicio = Date.UTC(anio, mes, dia - ((local.getUTCDay() + 6) % 7));
    paso = 'day';
  } else if (periodo === 'trimestre') {
    inicio = Date.UTC(anio, Math.floor(mes / 3) * 3, 1);
    paso = 'week';
  } else {
    inicio = Date.UTC(anio, mes, 1);
    paso = 'day';
  }
  return { desde: `${new Date(inicio).toISOString().slice(0, 19)}-06:00`, hasta: ahora.toISOString(), paso };
}

async function rpc(acceso, funcion, argumentos, traer) {
  const respuesta = await traer(`${acceso.base}/rest/v1/rpc/${funcion}`, {
    method: 'POST',
    headers: acceso.cabeceras,
    body: JSON.stringify(argumentos),
  });
  if (!respuesta.ok) throw new Error(`Supabase respondió ${respuesta.status} en ${funcion}.`);
  return respuesta.json();
}

/** Balance de un periodo: totales, desglose por usuario y serie para la gráfica. */
export async function resumenDe(periodo, variables = {}, ahora = new Date(), traer = fetch) {
  const acceso = conexion(variables);
  if (!acceso) {
    return {
      estado: 503,
      cuerpo: { error: { message: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el servidor.', codigo: 'SIN_BASE' } },
    };
  }
  const rango = rangoDe(periodo, ahora);
  try {
    const [resumen, serie] = await Promise.all([
      rpc(acceso, 'gemini_resumen', { desde: rango.desde }, traer),
      rpc(acceso, 'gemini_serie', rango, traer),
    ]);
    return { estado: 200, cuerpo: { periodo, ...rango, ...resumen, serie: serie ?? [] } };
  } catch (error) {
    return { estado: 502, cuerpo: { error: { message: error.message, codigo: 'BASE' } } };
  }
}

/**
 * GET /api/gasto?periodo=dia|semana|mes|trimestre. Solo para administradores:
 * un vendedor recibe 403 y nada de cifras.
 */
export async function atenderGasto(cabeceraCookie, url, variables = {}, ahora = new Date(), traer = fetch) {
  const usuario = leerSesion(tokenDeCookies(cabeceraCookie), secretoDe(variables));
  if (!usuario) return { estado: 401, cuerpo: JSON.parse(RESPUESTA_SIN_SESION) };
  if (rolDe(usuario) !== 'admin') {
    return { estado: 403, cuerpo: { error: { message: 'No tienes permiso para ver esto.', codigo: 'SIN_PERMISO' } } };
  }
  const periodo = new URL(url ?? '/', 'http://local').searchParams.get('periodo') || 'mes';
  if (!PERIODOS.includes(periodo)) {
    return { estado: 400, cuerpo: { error: { message: 'Periodo no válido.', codigo: 'PERIODO' } } };
  }
  return resumenDe(periodo, variables, ahora, traer);
}
