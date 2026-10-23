// Gasto en Gemini de la captura en curso y balance del mes.
//
// El servidor calcula y guarda el costo de cada llamada (api/_gasto.js) y lo
// devuelve en la cabecera X-Costo-USD. Aquí se suma por captura; el balance
// mensual se pide a /api/gasto. Cada captura lleva un id (cabecera X-Captura)
// que cambia con «Nuevo expediente».

// Pesos por dólar para mostrar una cifra aproximada. Ajustar a mano.
export const TIPO_CAMBIO_MXN = 18.5;

export const EVENTO_GASTO = 'captura:gasto';

const nuevoId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

let capturaId = nuevoId();
let gastoUsd = 0;
let llamadas = 0;

export const capturaActual = () => capturaId;
export const gastoDeCaptura = () => ({ usd: gastoUsd, llamadas });

function avisar() {
  window.dispatchEvent(new CustomEvent(EVENTO_GASTO, { detail: gastoDeCaptura() }));
}

/** Suma el costo de una respuesta (valor de X-Costo-USD). */
export function anotarCosto(cabecera) {
  const usd = Number(cabecera);
  if (!Number.isFinite(usd) || usd <= 0) return;
  gastoUsd += usd;
  llamadas += 1;
  avisar();
}

/** Empieza una captura nueva: contador en cero e id nuevo. */
export function reiniciarGasto() {
  capturaId = nuevoId();
  gastoUsd = 0;
  llamadas = 0;
  avisar();
}

export const formatoUsd = (usd) => `$${Number(usd || 0).toFixed(usd < 1 ? 4 : 2)}`;
export const formatoMxn = (usd) => `$${(Number(usd || 0) * TIPO_CAMBIO_MXN).toFixed(2)}`;

export const PERIODOS = [
  { id: 'dia', nombre: 'Día', detalle: 'hoy, por hora' },
  { id: 'semana', nombre: 'Semana', detalle: 'desde el lunes, por día' },
  { id: 'mes', nombre: 'Mes', detalle: 'este mes, por día' },
  { id: 'trimestre', nombre: 'Trimestre', detalle: 'este trimestre, por semana' },
];

/** Balance de un periodo (solo admin); lanza Error con el motivo si falla. */
export async function balanceDe(periodo) {
  const respuesta = await fetch(`/api/gasto?periodo=${encodeURIComponent(periodo)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(cuerpo?.error?.message ?? `Error ${respuesta.status}.`);
  return cuerpo;
}
