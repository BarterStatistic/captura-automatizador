// Utilidades de escritura sobre el DOM de Dinamo, compartidas por el motor de
// la captura y por las dos ventanas emergentes.
//
// Se carga como script clásico antes que ellos, así que lo que define queda
// disponible en su mismo scope.

const pausa = (ms) => new Promise((seguir) => setTimeout(seguir, ms));

// --- Escritura ----------------------------------------------------------------

/** El catálogo o la sección no llegaron. */
class ErrorTiempo extends Error {}

/**
 * Asigna con el setter nativo del prototipo.
 *
 * Se evita `campo.value = x` porque si la página redefinió `value` sobre el
 * elemento, la asignación iría a parar a ese setter en vez de al del navegador.
 * Desde el mundo aislado eso es difícil de detectar y el síntoma es un campo
 * que queda vacío sin explicación.
 */
const SETTER_INPUT = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
const SETTER_AREA = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

function asignarValor(elemento, texto) {
  const setter = elemento instanceof HTMLTextAreaElement ? SETTER_AREA : SETTER_INPUT;
  if (setter) setter.call(elemento, texto);
  else elemento.value = texto;
}

/** ¿El elemento existe, está habilitado y se puede escribir? */
function utilizable(elemento) {
  return Boolean(elemento) && !elemento.disabled && !elemento.readOnly;
}

/**
 * Espera a que el campo exista y esté habilitado.
 *
 * No basta con que exista: la página los crea todos de una vez, deshabilitados,
 * y los va soltando conforme se validan las secciones anteriores.
 */
async function esperarCampo(id, segundos = 20) {
  const limite = Date.now() + segundos * 1000;
  for (;;) {
    const elemento = document.getElementById(id);
    if (utilizable(elemento)) return elemento;
    if (Date.now() >= limite) {
      if (!elemento) throw new ErrorTiempo('no apareció en la página');
      if (elemento.readOnly) throw new ErrorTiempo('es de solo lectura');
      throw new ErrorTiempo('sigue deshabilitado');
    }
    await pausa(200);
  }
}

/** Escribe y devuelve lo que REALMENTE quedó en el campo. */
function escribirTexto(elemento, valor) {
  const texto = String(valor);

  elemento.focus();
  asignarValor(elemento, '');
  elemento.dispatchEvent(new Event('input', { bubbles: true }));
  asignarValor(elemento, texto);
  elemento.dispatchEvent(new Event('input', { bubbles: true }));
  elemento.dispatchEvent(new Event('change', { bubbles: true }));

  // Segundo intento imitando tecleo, por si algún handler solo reacciona a
  // eventos de teclado.
  if (!elemento.value) {
    elemento.focus();
    elemento.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    asignarValor(elemento, texto);
    elemento.dispatchEvent(new Event('input', { bubbles: true }));
    elemento.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    elemento.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (!elemento.value) throw new Error('el campo quedó vacío después de escribirlo');
  return elemento.value;
}

function aplicarSeleccion(select, opcion) {
  select.value = opcion.value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return opcion.text.trim();
}

function seleccionarPorValue(select, valor) {
  const opcion = [...select.options].find((o) => o.value === String(valor));
  if (!opcion) {
    const muestra = [...select.options].slice(0, 5).map((o) => o.value).join(', ');
    throw new Error(`no existe la opción «${valor}». Hay: ${muestra}…`);
  }
  return aplicarSeleccion(select, opcion);
}

/** Elige por el texto que ve una persona; exacta primero, luego parcial. */
function seleccionarPorTexto(select, texto) {
  const objetivo = String(texto).trim().toUpperCase();
  const opciones = [...select.options];

  const exacta = opciones.find((o) => o.text.trim().toUpperCase() === objetivo);
  if (exacta) return aplicarSeleccion(select, exacta);

  const parcial = opciones.find((o) => o.text.trim().toUpperCase().includes(objetivo));
  if (parcial) return aplicarSeleccion(select, parcial);

  const muestra = opciones.slice(1, 6).map((o) => o.text.trim()).join(', ');
  throw new Error(`no se encontró «${texto}». Opciones: ${muestra}…`);
}

// Opciones que no son una elección real: «-AGENCIA-», «<-- Seleccione -->»…
const VALORES_VACIOS = new Set(['', '0', 'CERO', '-']);

function opcionesReales(select) {
  return [...select.options].filter((o) => !VALORES_VACIOS.has(String(o.value).trim()));
}

/** Espera a que el AJAX pueble un select (más de la opción de placeholder). */
async function esperarOpciones(id, segundos = 15) {
  const limite = Date.now() + segundos * 1000;
  for (;;) {
    const select = document.getElementById(id);
    if (select && select.options.length > 1) return select;
    if (Date.now() >= limite) throw new ErrorTiempo(`el catálogo de ${id} no cargó a tiempo`);
    await pausa(250);
  }
}

// --- Botones ------------------------------------------------------------------

/**
 * Busca un botón por la función de su `onclick`.
 *
 * Los XPath absolutos del mapeo original se rompen en cuanto alguien inserta un
 * <tr>; el nombre de la función no. Y en Datos Fiscales esto es lo único
 * seguro: ahí `btnGuardarDatos` es el botón de Cancelar.
 */
function botonPorOnclick(nombreFuncion) {
  const candidatos = [...document.querySelectorAll('input[type="button"], button, a')].filter(
    (elemento) => String(elemento.getAttribute('onclick') ?? '').includes(`${nombreFuncion}(`),
  );
  // Hay funciones con dos botones (nextStep tiene uno para convenios, oculto).
  // Gana el que una persona podría presionar: visible y habilitado.
  return candidatos.find((elemento) => visible(elemento) && !elemento.disabled) ?? candidatos[0] ?? null;
}

/** ¿Está a la vista? Un elemento dentro de algo con display:none no tiene cajas. */
function visible(elemento) {
  return Boolean(elemento) && elemento.getClientRects().length > 0;
}
