// El llenado de la Captura de Ventas DSC, sección por sección.
//
// Dos reglas que no se tocan:
//
//   1. El llenado ocurre a la vista, en la pestaña que el capturista está
//      mirando.
//   2. NUNCA se presiona Grabar (`valida()`). Una captura de crédito no se
//      deshace, así que la envía una persona después de revisar.
//
// La página nace con todos los campos `disabled` y cada «Validar Datos» habilita
// la sección siguiente. Por eso esto es una máquina de pasos y no un recorrido
// plano: si una sección no se habilita, la corrida se detiene ahí en vez de
// seguir escribiendo en campos que nadie está leyendo.

const PAUSA_ENTRE_CAMPOS = 350;

let idPestanaApp;
let llenando = false;

// --- Comunicación -------------------------------------------------------------

function publicar(tipo, mensaje, seccion = null, campo = null, valor = null) {
  chrome.runtime
    .sendMessage({
      tipo: 'evento-llenado',
      idPestanaApp,
      evento: { tipo, mensaje, seccion, campo, valor },
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
let emergenteTerminada = null;

window.addEventListener('message', (evento) => {
  if (evento.source !== window) return;
  if (evento.data?.fuente === 'dinamo-hook' && evento.data.tipo === 'aviso') {
    ultimoAviso = evento.data.texto;
  }
});

chrome.runtime.onMessage.addListener((mensaje) => {
  if (mensaje?.tipo === 'emergente-terminada') emergenteTerminada = mensaje;
  return false;
});

/**
 * Espera a que la página dispare un aviso, hasta `ms`.
 *
 * Se comprueba SIEMPRE antes de rendirse: el aviso viaja del contexto de la
 * página al del content script por postMessage, que es asíncrono, y el
 * navegador ralentiza los temporizadores de pestañas en segundo plano, así que
 * una espera de 50 ms puede durar un segundo y dejar un hueco enorme.
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

/**
 * Descarta cualquier respuesta vieja ANTES de abrir la ventana.
 *
 * No se puede limpiar dentro de `esperarEmergente`: entre el clic que abre la
 * ventana y la llamada a esperar hay más de un segundo (la espera de avisos),
 * y una ventana que conteste rápido lo haría en ese hueco. Limpiar entonces
 * borraría justo la respuesta que se está esperando, y la corrida se quedaría
 * colgada hasta agotar el tiempo.
 */
function prepararEmergente() {
  emergenteTerminada = null;
}

async function esperarEmergente(cual, segundos = 60) {
  const limite = Date.now() + segundos * 1000;
  for (;;) {
    if (emergenteTerminada?.cual === cual) {
      const resultado = emergenteTerminada;
      emergenteTerminada = null;
      return resultado;
    }
    if (Date.now() >= limite) return { ok: false, detalle: 'la ventana no respondió a tiempo' };
    await pausa(200);
  }
}

// --- Botones ------------------------------------------------------------------

async function presionar(nombreFuncion, etiqueta, seccion) {
  const boton = botonPorOnclick(nombreFuncion);
  if (!boton) {
    publicar('error', `${etiqueta}: no se encontró el botón (${nombreFuncion}).`, seccion);
    return false;
  }
  boton.click();
  const aviso = await esperarAviso();
  if (aviso) publicar('aviso', `${etiqueta}: la página dijo «${aviso}».`, seccion);
  return true;
}

// --- Accesorio ----------------------------------------------------------------

/**
 * Pone cantidad 1 en el accesorio de servicio, localizándolo por su código.
 *
 * `canAcce_N` es la posición en una lista que cambia según modelo y agencia:
 * escribir en el índice equivocado le cobraría al cliente un accesorio que no
 * pidió. Por eso, si hay dudas, no se escribe nada.
 */
async function marcarAccesorio(accesorio, seccion) {
  const filas = [...document.querySelectorAll('input[id^="canAcce_"]')]
    .map((entrada) => ({ entrada, fila: entrada.closest('tr') }))
    .filter(({ fila }) => fila);

  const coinciden = filas.filter(({ fila }) => {
    const texto = fila.textContent ?? '';
    return texto.includes(accesorio.codigo) || texto.toUpperCase().includes(accesorio.descripcion);
  });

  if (coinciden.length !== 1) {
    publicar(
      'error',
      coinciden.length === 0
        ? `No se encontró el accesorio ${accesorio.codigo} (${accesorio.descripcion}). Márcalo a mano.`
        : `Hay ${coinciden.length} accesorios que coinciden con ${accesorio.codigo}. No se marcó ninguno: elígelo tú.`,
      seccion,
    );
    return;
  }

  const { entrada } = coinciden[0];
  if (!utilizable(entrada)) {
    publicar('error', 'El accesorio de servicio está deshabilitado.', seccion);
    return;
  }

  escribirTexto(entrada, '1');
  // `modifica_accesorios()` corre en el blur y recalcula el enganche.
  entrada.dispatchEvent(new Event('blur', { bubbles: true }));
  entrada.blur();
  publicar('campo', `Servicio preventivo: 1 (${accesorio.codigo})`, seccion, entrada.id, '1');
  await pausa(600);
}

// --- Un campo ------------------------------------------------------------------

async function llenarCampo(campo, expediente, seccion) {
  const esFijo = campo.fijo !== undefined;
  const valor = esFijo ? campo.fijo : valorEn(expediente, campo.de);

  if (!esFijo && String(valor).trim() === '') {
    if (!campo.opcional) {
      publicar('aviso', `${campo.etiqueta}: sin dato, se dejó vacío.`, seccion, campo.id);
    }
    return;
  }

  let elemento;
  try {
    elemento = await esperarCampo(campo.id);
  } catch (error) {
    publicar('error', `${campo.etiqueta}: ${error.message}.`, seccion, campo.id);
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
      seccion,
      campo.id,
      elemento.value,
    );
    return;
  }

  try {
    let quedo;
    if (campo.tipo === 'checkbox') {
      if (!elemento.checked) elemento.click();
      quedo = elemento.checked ? 'marcada' : 'sin marcar';
    } else if (campo.tipo === 'select') {
      quedo = seleccionarPorValue(elemento, valor);
    } else if (campo.tipo === 'selectTexto') {
      if (campo.dinamico) await esperarOpciones(campo.id);
      quedo = seleccionarPorTexto(elemento, valor);
    } else if (campo.tipo === 'selectNumero') {
      if (campo.dinamico) await esperarOpciones(campo.id);
      quedo = seleccionarPorNumero(elemento, valor);
    } else {
      quedo = escribirTexto(elemento, valor);
    }

    // Se reporta lo que quedó, no lo que se quiso poner: si la página lo recortó
    // o lo normalizó, quien revisa tiene que verlo.
    publicar('campo', `${campo.etiqueta}: ${quedo}`, seccion, campo.id, quedo);

    if (campo.tipo === 'texto' && quedo !== String(valor)) {
      publicar(
        'aviso',
        `${campo.etiqueta}: Dinamo lo dejó como «${quedo}» en vez de «${valor}». Revísalo.`,
        seccion,
        campo.id,
      );
    }
  } catch (error) {
    publicar('error', `${campo.etiqueta}: ${error.message}`, seccion, campo.id);
  }

  await pausa(PAUSA_ENTRE_CAMPOS);
}

// --- Pasos especiales ----------------------------------------------------------

async function buscarCliente(seccion, expediente) {
  const rfc = valorEn(expediente, seccion.buscarCliente.de);
  if (!rfc) {
    publicar('aviso', 'Sin RFC calculado: no se buscó al cliente.', seccion.id);
    return;
  }

  try {
    const entrada = await esperarCampo(seccion.buscarCliente.id);
    escribirTexto(entrada, rfc);
    publicar('campo', `Buscar cliente: ${rfc}`, seccion.id, entrada.id, rfc);
    await presionar(seccion.buscarCliente.boton, 'Buscar cliente', seccion.id);
    await pausa(1500);
  } catch (error) {
    publicar('error', `Buscar cliente: ${error.message}`, seccion.id);
  }
}

async function pasarPorDatosFiscales(seccion) {
  publicar('seccion', 'Abriendo Datos Fiscales…', seccion.id);
  prepararEmergente();
  if (!(await presionar(seccion.datosFiscales.boton, 'Datos Fiscales', seccion.id))) return;

  const resultado = await esperarEmergente('fiscales');
  if (resultado.ok) {
    publicar('campo', `Datos Fiscales: ${resultado.detalle}`, seccion.id);
  } else {
    publicar('error', `Datos Fiscales: ${resultado.detalle}. Complétalo a mano.`, seccion.id);
  }
}

async function pasarPorSepomex(seccion) {
  publicar('seccion', `Abriendo SEPOMEX (${seccion.sepomex.tipo})…`, seccion.id);

  const enlace = [...document.querySelectorAll('a')].find((a) =>
    String(a.getAttribute('href') ?? '').includes(`sepomex('${seccion.sepomex.tipo}')`),
  );
  if (!enlace) {
    publicar('error', 'No se encontró el enlace de SEPOMEX. Elige la colonia a mano.', seccion.id);
    return;
  }
  prepararEmergente();
  enlace.click();

  const resultado = await esperarEmergente('sepomex');
  if (resultado.ok) {
    publicar('campo', `SEPOMEX: ${resultado.detalle}`, seccion.id);
  } else {
    publicar('error', `SEPOMEX: ${resultado.detalle}. Elige la colonia a mano.`, seccion.id);
  }
}

// --- La corrida ----------------------------------------------------------------

async function esperarSeccionHabilitada(seccion, segundos = 25) {
  const primero = seccion.campos.find((campo) => campo.tipo !== 'checkbox');
  if (!primero) return true;

  const limite = Date.now() + segundos * 1000;
  for (;;) {
    if (utilizable(document.getElementById(primero.id))) return true;
    if (Date.now() >= limite) return false;
    await pausa(250);
  }
}

async function llenar(expediente) {
  if (llenando) return;
  llenando = true;
  capturarAvisos(true);

  try {
    publicar('inicio', 'Cargando la captura de Dinamo…');

    for (const seccion of SECCIONES) {
      publicar('seccion', `— ${seccion.etiqueta} —`, seccion.id);

      // Estos pasos van ANTES de comprobar que la sección esté habilitada,
      // porque son justamente los que la habilitan: marcar la casilla de la
      // referencia, buscar al cliente y volver de Datos Fiscales.
      if (seccion.activar) document.getElementById(seccion.activar)?.click();
      if (seccion.buscarCliente) await buscarCliente(seccion, expediente);
      if (seccion.datosFiscales) await pasarPorDatosFiscales(seccion);

      if (!(await esperarSeccionHabilitada(seccion))) {
        publicar(
          'error',
          `La sección «${seccion.etiqueta}» no se habilitó. La corrida se detiene aquí; ` +
            'revisa la pantalla y continúa a mano desde este punto.',
          seccion.id,
        );
        break;
      }

      for (const campo of seccion.campos) {
        await llenarCampo(campo, expediente, seccion.id);
      }

      if (seccion.accesorio) await marcarAccesorio(seccion.accesorio, seccion.id);
      if (seccion.sepomex) await pasarPorSepomex(seccion);
      if (seccion.validarEmail) await presionar(seccion.validarEmail, 'Validar email', seccion.id);
      if (seccion.validar) await presionar(seccion.validar, 'Validar datos', seccion.id);

      await pausa(500);
    }

    publicar(
      'fin',
      'Listo. Revisa la captura en esta pestaña y, si todo está bien, presiona tú mismo ' +
        'el botón Grabar. La extensión no envía nada.',
    );
  } catch (error) {
    publicar('error', `El llenado se interrumpió: ${error.message}`);
    publicar('fin', 'La corrida terminó con errores.');
  } finally {
    capturarAvisos(false);
    llenando = false;
  }
}

// --- Enganche -------------------------------------------------------------------

/**
 * Pide su trabajo al background.
 *
 * Se reintenta porque la carrera corre en los dos sentidos: con la página en
 * caché este script puede pedir turno antes de que el background alcance a
 * registrar el trabajo.
 */
async function pedirTrabajo(intentos = 4) {
  for (let i = 0; i < intentos; i += 1) {
    const respuesta = await chrome.runtime
      .sendMessage({ tipo: 'listo-para-llenar' })
      .catch(() => null);
    if (respuesta?.expediente) {
      idPestanaApp = respuesta.idPestanaApp;
      return llenar(respuesta.expediente);
    }
    await pausa(300);
  }
}

pedirTrabajo();
