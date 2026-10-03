// El llenado de la Captura de Ventas DSC, de corrido.
//
// Dos reglas que no se tocan:
//
//   1. El llenado ocurre a la vista, en la pestaña que el capturista está
//      mirando.
//   2. NUNCA se presiona Grabar (`valida()`). Una captura de crédito no se
//      deshace, así que la envía una persona después de revisar.
//
// Desde la 1.8.0 la corrida no espera a nadie. Escribe todo lo que tiene, de
// «Buscar cliente» a las referencias, y lo que solo puede hacer una persona
// (las colonias en SEPOMEX, los «Validar Datos» que dependen de ellas, las
// preguntas de Dinamo, los datos que faltan) lo junta en un resumen final que
// la app muestra como «Pendiente a mano».
//
// Si una sección sigue bloqueada (sus campos `disabled` hasta que se valide la
// anterior), se escribe igual: un campo deshabilitado guarda su valor, y en
// cuanto Dinamo lo habilita ya está lleno.

const PAUSA_ENTRE_CAMPOS = 120;
// Lo que se le da a una sección para habilitarse antes de escribirla como esté.
const ESPERA_SECCION = 2;

let idPestanaApp;
let llenando = false;

// Lo que queda para una persona, en el orden en que se encontró.
let pendientes = [];

function pendiente(texto) {
  if (!pendientes.includes(texto)) pendientes.push(texto);
}

// --- Comunicación -------------------------------------------------------------

function publicar(tipo, mensaje, seccion = null, campo = null, valor = null, extra = {}) {
  chrome.runtime
    .sendMessage({
      tipo: 'evento-llenado',
      idPestanaApp,
      evento: { tipo, mensaje, seccion, campo, valor, ...extra },
    })
    .catch(() => {}); // el service worker pudo reciclarse; el llenado sigue
}

function capturarAvisos(activo) {
  window.postMessage(
    { fuente: 'dinamo-contenido', tipo: 'capturar-avisos', activo },
    window.location.origin,
  );
}

let ultimoAviso = null;

window.addEventListener('message', (evento) => {
  if (evento.source !== window) return;
  if (evento.data?.fuente !== 'dinamo-hook') return;
  if (evento.data.tipo === 'aviso') ultimoAviso = evento.data.texto;
  // Una pregunta de Dinamo («¿El cliente cuenta con homoclave?») no se contesta
  // sola, pero tampoco detiene la corrida: queda en pantalla y en el resumen.
  if (evento.data.tipo === 'pregunta') {
    publicar('aviso', `Dinamo preguntó «${evento.data.texto}». Contéstala tú en la pantalla.`);
    pendiente(`Contesta la pregunta de Dinamo: «${evento.data.texto}».`);
  }
});

/**
 * Espera a que la página dispare un aviso, hasta `ms`.
 *
 * Se comprueba SIEMPRE antes de rendirse: el aviso viaja del contexto de la
 * página al del content script por postMessage, que es asíncrono.
 */
async function esperarAviso(ms = 1200) {
  const limite = Date.now() + ms;
  for (;;) {
    if (ultimoAviso !== null) {
      const texto = ultimoAviso;
      ultimoAviso = null;
      return texto;
    }
    if (Date.now() >= limite) return null;
    await pausa(50);
  }
}

// --- Botones ------------------------------------------------------------------

async function presionar(nombreFuncion, etiqueta, seccion) {
  const boton = botonPorOnclick(nombreFuncion);
  if (!boton || boton.disabled) {
    publicar('aviso', `${etiqueta}: el botón no se pudo presionar; hazlo tú.`, seccion);
    pendiente(`Presiona «${etiqueta}».`);
    return false;
  }
  boton.click();
  const aviso = await esperarAviso();
  if (aviso) publicar('aviso', `${etiqueta}: la página dijo «${aviso}».`, seccion);
  return true;
}

// --- Un campo ------------------------------------------------------------------

/**
 * El campo, habilitado o no: uno deshabilitado guarda lo que se le escribe.
 * Solo falla si no existe o es de solo lectura, los dos casos en que escribir
 * no sirve. La espera a que se habilite es por sección, no por campo: con 60
 * campos bloqueados, esperar en cada uno hacía la corrida de varios minutos.
 */
function campoParaEscribir(id) {
  const elemento = document.getElementById(id);
  if (!elemento) throw new ErrorTiempo('no apareció en la página');
  if (elemento.readOnly) throw new ErrorTiempo('es de solo lectura');
  return elemento;
}

/**
 * Un momento para que la sección se habilite (la anterior pudo validarse
 * recién, o el AJAX de «Buscar cliente» sigue en camino). Si no, se escribe
 * igual.
 */
async function esperarSeccion(seccion) {
  const primero = [...(seccion.inicio ?? []), ...seccion.campos].find(
    (campo) => campo.tipo !== 'checkbox' && campo.tipo !== 'radio',
  );
  if (!primero) return;
  const limite = Date.now() + ESPERA_SECCION * 1000;
  while (!utilizable(document.getElementById(primero.id)) && Date.now() < limite) {
    await pausa(150);
  }
}

/** Marca una casilla o un radio aunque esté deshabilitado (ahí el clic no hace nada). */
function marcar(elemento) {
  if (elemento.checked) return;
  if (!elemento.disabled) elemento.click();
  if (!elemento.checked) {
    elemento.checked = true;
    elemento.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/** Sale del campo para que corra su validación (txtrfc, txtemail). */
function salirDe(elemento) {
  if (document.activeElement === elemento) elemento.blur();
  else elemento.dispatchEvent(new FocusEvent('blur'));
}

function valorDelCampo(campo, expediente) {
  if (campo.fijo !== undefined) return campo.fijo;
  const valor = valorEn(expediente, campo.de);
  // txtsueldo solo acepta dígitos: «12,500.40» se vuelve 12500.
  if (campo.entero && valor.trim() !== '') {
    const numero = Number(valor.replace(/[^\d.]/g, ''));
    return Number.isFinite(numero) && numero > 0 ? String(Math.round(numero)) : '';
  }
  return valor;
}

async function llenarCampo(campo, expediente, seccion) {
  const esFijo = campo.fijo !== undefined;
  const valor = valorDelCampo(campo, expediente);

  if (!esFijo && String(valor).trim() === '') {
    if (!campo.opcional) {
      publicar('aviso', `${campo.etiqueta}: sin dato, se dejó vacío.`, seccion.id, campo.id);
      pendiente(`${seccion.etiqueta} · ${campo.etiqueta}: no venía en los documentos.`);
    }
    return;
  }

  let elemento;
  try {
    elemento = campoParaEscribir(campo.id);
  } catch (error) {
    publicar('error', `${campo.etiqueta}: ${error.message}.`, seccion.id, campo.id);
    pendiente(`${seccion.etiqueta} · ${campo.etiqueta}: escríbelo a mano (${valor}).`);
    return;
  }

  // Cliente ya existente: lo que el sistema trajo no se sobrescribe.
  //
  // Solo para campos de TEXTO. Un <select> siempre tiene una opción marcada -su
  // primera opción-, así que tratarlo como "ya venía con dato" dejaría el plazo,
  // el sector y el tipo de teléfono con lo que hubiera por defecto. Los valores
  // fijos del trámite tampoco se respetan: esos se imponen siempre.
  if (!esFijo && campo.tipo === 'texto' && String(elemento.value ?? '').trim() !== '') {
    publicar(
      'aviso',
      `${campo.etiqueta}: ya venía con «${elemento.value}», se respetó.`,
      seccion.id,
      campo.id,
      elemento.value,
    );
    return;
  }

  try {
    let quedo;
    if (campo.tipo === 'checkbox') {
      marcar(elemento);
      quedo = elemento.checked ? 'marcada' : 'sin marcar';
    } else if (campo.tipo === 'radio') {
      // El clic dispara su onclick (prepara_controles, cambia_forma…).
      marcar(elemento);
      quedo = elemento.checked ? campo.texto ?? 'elegido' : 'sin elegir';
    } else if (campo.tipo === 'select') {
      quedo = seleccionarPorValue(elemento, valor);
    } else if (campo.tipo === 'selectTexto') {
      if (campo.dinamico) await esperarOpciones(campo.id, 4);
      quedo = seleccionarPorTexto(elemento, valor);
    } else {
      quedo = escribirTexto(elemento, valor);
      // Algunos campos hacen su trabajo al salir (txtrfc calcula la fecha de
      // nacimiento y valida la edad; txtemail valida el dominio).
      if (campo.blur) {
        salirDe(elemento);
        await pausa(400);
      }
    }

    // Se reporta lo que quedó, no lo que se quiso poner: si la página lo recortó
    // o lo normalizó, quien revisa tiene que verlo.
    publicar('campo', `${campo.etiqueta}: ${quedo}`, seccion.id, campo.id, quedo);

    if (campo.tipo === 'texto' && quedo !== String(valor)) {
      publicar(
        'aviso',
        `${campo.etiqueta}: Dinamo lo dejó como «${quedo}» en vez de «${valor}». Revísalo.`,
        seccion.id,
        campo.id,
      );
    }
  } catch (error) {
    publicar('error', `${campo.etiqueta}: ${error.message}`, seccion.id, campo.id);
    if (!campo.opcional) {
      pendiente(`${seccion.etiqueta} · ${campo.etiqueta}: elígelo a mano (${valor}).`);
    }
  }

  await pausa(PAUSA_ENTRE_CAMPOS);
}

// --- Pasos especiales ----------------------------------------------------------

async function buscarCliente(seccion, expediente) {
  const { id, de, boton } = seccion.buscarCliente;
  const rfc = valorEn(expediente, de);
  if (!rfc) {
    publicar('aviso', 'Sin RFC calculado: no se buscó al cliente.', seccion.id);
    pendiente('Busca al cliente por RFC en «Buscar cliente»: la app no pudo calcularlo.');
    return;
  }

  let entrada;
  try {
    entrada = await esperarCampo(id, ESPERA_SECCION);
  } catch (error) {
    publicar('error', `Buscar cliente: el campo ${error.message}.`, seccion.id, id);
    pendiente(`Busca al cliente por RFC (${rfc}) en «Buscar cliente».`);
    return;
  }

  escribirTexto(entrada, rfc);
  publicar('campo', `Buscar cliente: ${rfc}`, seccion.id, id, rfc);
  await presionar(boton, 'Buscar cliente', seccion.id);
  // Si el cliente ya existe, Dinamo trae sus datos por AJAX: se espera a que
  // termine para no escribir encima de una respuesta que todavía no llega.
  await pausa(1500);
}

/** «CP 25000, colonia Centro», con lo que haya en el expediente. */
function pistaDeColonia(seccion, expediente) {
  const { pista } = seccion.colonia;
  return [
    pista?.cp && valorEn(expediente, pista.cp) ? `CP ${valorEn(expediente, pista.cp)}` : '',
    pista?.colonia && valorEn(expediente, pista.colonia)
      ? `colonia ${valorEn(expediente, pista.colonia)}`
      : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Lo que la sección deja para el vendedor: elegir la colonia en SEPOMEX y, ya
 * con ella, presionar «Validar Datos». Se anota al final de la corrida, cuando
 * ya se sabe si la colonia se eligió mientras tanto.
 */
function pendienteDeSeccion(seccion, expediente) {
  const cp = String(document.getElementById(seccion.colonia.cp)?.value ?? '').trim();
  if (cp) {
    pendiente(`${seccion.etiqueta}: presiona «Validar Datos».`);
    return;
  }
  const datos = pistaDeColonia(seccion, expediente);
  pendiente(
    `${seccion.etiqueta}: elige la colonia ${seccion.colonia.que} en SEPOMEX` +
      `${datos ? ` (${datos})` : ''} y presiona «Validar Datos».`,
  );
}

// --- La corrida ----------------------------------------------------------------

/** ¿Hay algo en esa ruta del expediente? (`valorEn` lo vuelve texto). */
function existeEn(objeto, ruta) {
  const valor = String(ruta)
    .split('.')
    .reduce((actual, tramo) => (actual == null ? undefined : actual[tramo]), objeto);
  return valor != null;
}

/** ¿El vendedor ya capturó la moto? Basta con que haya modelo elegido. */
function motoCapturada() {
  const modelo = document.getElementById('cbomodelos');
  return Boolean(modelo) && !VALORES_VACIOS.has(String(modelo.value).trim());
}

/** Lo que Dinamo pide y la extensión nunca llena; se anota solo si sigue vacío. */
function pendientesFijos() {
  const vacio = (id) => {
    const elemento = document.getElementById(id);
    return Boolean(elemento) && VALORES_VACIOS.has(String(elemento.value ?? '').trim());
  };
  if (vacio('cboedo_nac') || vacio('cboMpio_nac')) {
    pendiente('Datos del cliente: elige el estado y el municipio de nacimiento.');
  }
  pendiente('Datos Fiscales del cliente (botón «DATOS FISCALES CLIENTE»): captúralos si el trámite los pide.');
}

async function llenar(expediente) {
  if (llenando) return;
  llenando = true;
  pendientes = [];
  ultimoAviso = null;
  capturarAvisos(true);

  try {
    publicar('inicio', 'Llenando la captura de Dinamo desde los datos del cliente…');

    // La moto es del vendedor. Sin ella no se empieza: los datos del cliente
    // se capturan sobre una venta ya armada.
    if (!motoCapturada()) {
      publicar(
        'error',
        'Primero captura en Dinamo el tipo de venta y la moto (falta elegir el modelo). ' +
          'Después vuelve a la app y presiona «Llenar en Dinamo».',
      );
      publicar('fin', 'No se llenó nada: falta capturar la moto.');
      return;
    }

    for (const seccion of SECCIONES) {
      // Las referencias 2 y 3 solo existen en el expediente cuando el esquema
      // las pide; si no vienen, la sección ni se abre.
      if (seccion.requiere && !existeEn(expediente, seccion.requiere)) continue;

      publicar('seccion', `— ${seccion.etiqueta} —`, seccion.id);

      // Las referencias 2 y 3 se abren marcando su casilla. Solo si no lo
      // está: un segundo clic la desmarca y vuelve a esconder la sección.
      if (seccion.activar) {
        const casilla = document.getElementById(seccion.activar);
        if (casilla && !casilla.checked) marcar(casilla);
      }

      // Cliente: primero se busca el RFC; eso es lo que habilita la sección.
      if (seccion.buscarCliente) await buscarCliente(seccion, expediente);

      await esperarSeccion(seccion);

      // Lo que Dinamo exige primero (el RFC en su campo), luego el resto.
      for (const campo of [...(seccion.inicio ?? []), ...seccion.campos]) {
        await llenarCampo(campo, expediente, seccion);
      }

      // Las validaciones que no dependen de nadie se presionan; las que
      // necesitan la colonia quedan para el vendedor.
      if (seccion.colonia) {
        pendienteDeSeccion(seccion, expediente);
      } else {
        if (seccion.validarEmail) await presionar(seccion.validarEmail, 'Validar email', seccion.id);
        if (seccion.validar) await presionar(seccion.validar, 'Validar datos', seccion.id);
      }
    }

    pendientesFijos();
    publicar(
      'resumen',
      pendientes.length === 1
        ? 'Queda 1 cosa por hacer a mano.'
        : `Quedan ${pendientes.length} cosas por hacer a mano.`,
      null,
      null,
      null,
      { pendientes: [...pendientes] },
    );
    publicar(
      'fin',
      'Listo. Termina lo pendiente, revisa la captura y presiona tú mismo el botón Grabar. ' +
        'La extensión no envía nada.',
    );
  } catch (error) {
    publicar('error', `El llenado se interrumpió: ${error.message}`);
    if (pendientes.length > 0) {
      publicar('resumen', 'Lo que quedó pendiente hasta donde llegó:', null, null, null, {
        pendientes: [...pendientes],
      });
    }
    publicar('fin', 'La corrida terminó con errores.');
  } finally {
    capturarAvisos(false);
    llenando = false;
  }
}

// --- Enganche -------------------------------------------------------------------

/**
 * El background avisa cuando la app pidió llenar. La pestaña ya estaba abierta
 * (el vendedor capturó ahí la moto), así que no se recarga: se empieza aquí.
 */
chrome.runtime.onMessage.addListener((mensaje) => {
  if (mensaje?.tipo === 'iniciar-llenado') {
    idPestanaApp = mensaje.idPestanaApp;
    llenar(mensaje.expediente);
  }
  return false;
});
