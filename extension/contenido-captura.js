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
// La excepción es Datos Fiscales: abre otra pestaña y la corrida la espera
// (con tope), porque al guardar Dinamo sustituye los datos del cliente por los
// fiscales y lo que se escriba antes se perdería.
//
// Si una sección sigue bloqueada (sus campos `disabled` hasta que se valide la
// anterior), se escribe igual: un campo deshabilitado guarda su valor, y en
// cuanto Dinamo lo habilita ya está lleno.

const PAUSA_ENTRE_CAMPOS = 120;
// Lo que se le da a una sección para habilitarse antes de escribirla como esté.
const ESPERA_SECCION = 2;

let idPestanaApp;
let llenando = false;

// Datos Fiscales: lo que la pestaña emergente va avisando.
let fiscalesAbierta = false;
let fiscalesCerrada = false;
let fiscalesResultado = null;

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
  let valor = valorEn(expediente, campo.de);
  // Un expediente de una versión anterior de la app no trae horarios ni puesto.
  if (valor.trim() === '' && campo.porDefecto !== undefined) valor = campo.porDefecto;
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
      // Si elegir esto recarga otra lista (estado → municipio), se anota cómo
      // estaba para esperar a que cambie antes de escribir la que depende de ella.
      const antes = campo.recarga ? firmaDeOpciones(campo.recarga) : null;
      quedo = seleccionarPorTexto(elemento, valor);
      if (campo.recarga) await esperarCambioDeOpciones(campo.recarga, antes, 3);
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

// --- Listas que se recargan -----------------------------------------------------

/** Las opciones de un <select> como un solo texto, para saber si cambiaron. */
function firmaDeOpciones(id) {
  const select = document.getElementById(id);
  return select ? [...select.options].map((opcion) => opcion.text.trim()).join('|') : '';
}

/**
 * Espera a que la lista de un <select> cambie después de elegir el de arriba
 * (el AJAX de estado → municipio). Si no cambia en `segundos` (el estado ya era
 * ese), sigue: no es un error.
 */
async function esperarCambioDeOpciones(id, firmaAnterior, segundos) {
  const limite = Date.now() + segundos * 1000;
  while (firmaDeOpciones(id) === firmaAnterior && Date.now() < limite) {
    await pausa(150);
  }
  await pausa(150);
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
    ...(pista?.lugar ?? []).map((ruta) => valorEn(expediente, ruta)),
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

// --- Datos Fiscales -----------------------------------------------------------

async function esperarHasta(condicion, segundos) {
  const limite = Date.now() + segundos * 1000;
  while (!condicion()) {
    if (Date.now() >= limite) return false;
    await pausa(200);
  }
  return true;
}

/** Lo que el sistema dejó en esta pantalla después de guardar los datos fiscales. */
function huellaFiscal() {
  const id = String(document.getElementById('id_fiscal')?.value ?? '').trim();
  const mensaje = String(document.getElementById('msgFiscal')?.textContent ?? '').trim();
  return { guardado: id !== '' && id !== '0', mensaje };
}

/**
 * Abre Datos Fiscales con el botón de la propia página y espera a que se llene.
 *
 * `showFiscal()` hace un AJAX y abre la pestaña con `window.open` desde su
 * respuesta. Con un clic simulado Edge la bloquea como pop-up salvo que los
 * pop-ups de dinamo2.intranet estén permitidos; por eso, si no aparece, el aviso
 * dice exactamente eso.
 */
async function pasarPorDatosFiscales(seccion, expediente) {
  const { boton, id } = seccion.datosFiscales;
  const antes = huellaFiscal();
  if (antes.guardado) {
    publicar('aviso', 'Datos Fiscales: la captura ya tiene datos fiscales, no se abrieron de nuevo.', seccion.id);
    return;
  }

  // showFiscal() se niega sin RFC (avisa «Porfavor ingrese el RFC»).
  if (!String(document.getElementById('txtrfc')?.value ?? '').trim()) {
    publicar('aviso', 'Datos Fiscales: el RFC no quedó escrito, no se abrieron.', seccion.id);
    pendiente('Datos Fiscales: escribe el RFC del cliente y presiona «Datos Fiscales».');
    return;
  }

  fiscalesAbierta = false;
  fiscalesCerrada = false;
  fiscalesResultado = null;
  publicar('seccion', 'Abriendo Datos Fiscales…', seccion.id);

  await chrome.runtime.sendMessage({ tipo: 'preparar-emergente', expediente }).catch(() => {});
  if (!(await presionar(boton, 'Datos Fiscales', seccion.id))) {
    // presionar ya dejó el pendiente genérico del botón.
    return;
  }

  if (!(await esperarHasta(() => fiscalesAbierta, 12))) {
    publicar(
      'error',
      'Datos Fiscales: no se abrió la pestaña. Si Edge mostró «pop-up bloqueado», permite las ' +
        'ventanas emergentes de dinamo2.intranet (edge://settings/content/popups).',
      seccion.id,
      id,
    );
    pendiente('Datos Fiscales: no se abrieron. Permite los pop-ups de dinamo2.intranet o captúralos a mano.');
    return;
  }

  // Dos finales posibles: la pestaña avisa (algo quedó pendiente, sigue abierta)
  // o se cierra sola (guardó).
  await esperarHasta(() => fiscalesResultado || fiscalesCerrada, 90);
  if (fiscalesCerrada) await pausa(800);

  const despues = huellaFiscal();
  if (despues.guardado) {
    publicar('campo', `Datos Fiscales: guardados${despues.mensaje ? ` (${despues.mensaje})` : ''}.`, seccion.id);
    return;
  }

  const detalle = fiscalesResultado?.detalle;
  if (fiscalesResultado && !fiscalesResultado.ok) {
    publicar('aviso', `Datos Fiscales: ${detalle}.`, seccion.id);
    pendiente(`Datos Fiscales: ${detalle}.`);
  } else if (fiscalesCerrada) {
    // Se cerró sin que el sistema marcara el guardado en esta pantalla: puede ser
    // que sí se guardó y esta pantalla no lo refleja, o que se cancelara.
    publicar('aviso', 'Datos Fiscales: la pestaña se cerró y no se ve el guardado en la captura; revísalo.', seccion.id);
    pendiente('Datos Fiscales: confirma que quedaron guardados (botón «Datos Fiscales»).');
  } else {
    publicar('aviso', 'Datos Fiscales: la pestaña no terminó a tiempo.', seccion.id);
    pendiente('Datos Fiscales: termina de capturarlos en la otra pestaña.');
  }
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

/**
 * Lo que Dinamo pide y no siempre se puede llenar. El estado de nacimiento sale
 * de la CURP; el municipio no sale de ningún documento, así que si la revisión
 * no lo trae lo elige el vendedor.
 */
function pendientesFijos(expediente) {
  const vacio = (id) => {
    const elemento = document.getElementById(id);
    return Boolean(elemento) && VALORES_VACIOS.has(String(elemento.value ?? '').trim());
  };
  if (!valorEn(expediente, 'datos.cliente.estadoNacimiento') && vacio('cboedo_nac')) {
    pendiente('Datos del cliente: elige el estado de nacimiento (la CURP no trae uno de la lista).');
  }
  if (!valorEn(expediente, 'datos.cliente.municipioNacimiento')) {
    pendiente('Datos del cliente: elige el municipio de nacimiento (no viene en la CURP ni en la INE).');
  }
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

      // Lo que Dinamo exige primero (el RFC en su campo), luego Datos Fiscales
      // (que sustituye los datos del cliente por los fiscales) y luego el resto.
      for (const campo of seccion.inicio ?? []) {
        await llenarCampo(campo, expediente, seccion);
      }
      if (seccion.datosFiscales) await pasarPorDatosFiscales(seccion, expediente);
      for (const campo of seccion.campos) {
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

    pendientesFijos(expediente);
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
  if (mensaje?.tipo === 'emergente-abierta') fiscalesAbierta = true;
  if (mensaje?.tipo === 'emergente-cerrada') fiscalesCerrada = true;
  if (mensaje?.tipo === 'emergente-terminada') fiscalesResultado = mensaje;
  if (mensaje?.tipo === 'iniciar-llenado') {
    idPestanaApp = mensaje.idPestanaApp;
    llenar(mensaje.expediente);
  }
  return false;
});
