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
// Una pregunta de Dinamo («¿El cliente cuenta con homoclave?») no se contesta
// sola: la corrida se detiene y la responde una persona.
let preguntaPendiente = null;

class PreguntaDeDinamo extends Error {}

window.addEventListener('message', (evento) => {
  if (evento.source !== window) return;
  if (evento.data?.fuente === 'dinamo-hook' && evento.data.tipo === 'aviso') {
    ultimoAviso = evento.data.texto;
  }
  if (evento.data?.fuente === 'dinamo-hook' && evento.data.tipo === 'pregunta') {
    preguntaPendiente = evento.data.texto;
  }
});

/** Si Dinamo hizo una pregunta, la corrida no sigue escribiendo encima. */
function revisarPregunta() {
  if (preguntaPendiente === null) return;
  const texto = preguntaPendiente;
  preguntaPendiente = null;
  throw new PreguntaDeDinamo(texto);
}

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

async function presionar(nombreFuncion, etiqueta, seccion, id = null) {
  const porId = id ? document.getElementById(id) : null;
  const boton = porId ?? botonPorOnclick(nombreFuncion);
  if (!boton) {
    publicar('error', `${etiqueta}: no se encontró el botón (${nombreFuncion}).`, seccion);
    return false;
  }
  boton.click();
  const aviso = await esperarAviso();
  if (aviso) publicar('aviso', `${etiqueta}: la página dijo «${aviso}».`, seccion);
  revisarPregunta();
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
  // Cada fila trae un oculto `impAcce_N` con valor «precio_ref_CÓDIGO_costo».
  // Se compara el código EXACTO: por descripción, «SERVICIO PREVENTIVO 1»
  // también coincide con «SERVICIO PREVENTIVO 1 (SINTETICO 2)», otro producto.
  const coinciden = [...document.querySelectorAll('input[id^="impAcce_"]')]
    .filter((oculto) => /^impAcce_\d+$/.test(oculto.id))
    .filter((oculto) => String(oculto.value).split('_')[2] === accesorio.codigo)
    .map((oculto) => ({ entrada: document.getElementById(oculto.id.replace('impAcce_', 'canAcce_')) }))
    .filter(({ entrada }) => entrada);

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

  // Campos que la página solo muestra en ciertos esquemas (el plan de pago).
  if (campo.soloSiVisible && !visible(document.getElementById(campo.id))) return;

  if (!esFijo && String(valor).trim() === '') {
    // Sin dato, pero con una sola opción posible: esa es.
    if (campo.unicaSiVacio) {
      try {
        const select = campo.dinamico ? await esperarOpciones(campo.id) : await esperarCampo(campo.id);
        const quedo = seleccionarUnica(select);
        if (quedo) {
          publicar('campo', `${campo.etiqueta}: ${quedo} (la única disponible)`, seccion, campo.id, quedo);
          await pausa(PAUSA_ENTRE_CAMPOS);
          return;
        }
      } catch {
        // cae al aviso de abajo
      }
    }
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
    } else if (campo.tipo === 'radio') {
      // El clic dispara su onclick (prepara_controles, cambia_forma…).
      if (!elemento.checked) elemento.click();
      quedo = elemento.checked ? campo.texto ?? 'elegido' : 'sin elegir';
    } else if (campo.tipo === 'selectModelo') {
      if (campo.dinamico) await esperarOpciones(campo.id);
      const elegido = seleccionarModelo(elemento, valor);
      quedo = elegido.texto;
      if (elegido.aproximado) {
        publicar(
          'aviso',
          `${campo.etiqueta}: «${valor}» no está escrito igual en Dinamo; se eligió «${quedo}». Revísalo.`,
          seccion,
          campo.id,
        );
      }
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
      // Algunos campos hacen su trabajo al salir (txtrfc calcula la fecha de
      // nacimiento y valida la edad; txtemail valida el dominio).
      if (campo.blur) {
        elemento.blur();
        await pausa(400);
      }
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
  revisarPregunta();
}

// --- Pasos especiales ----------------------------------------------------------

async function pasarPorDatosFiscales(seccion) {
  publicar('seccion', 'Abriendo Datos Fiscales…', seccion.id);
  prepararEmergente();
  if (
    !(await presionar(seccion.datosFiscales.boton, 'Datos Fiscales', seccion.id, seccion.datosFiscales.id))
  ) {
    return;
  }

  const resultado = await esperarEmergente('fiscales');
  if (resultado.ok) {
    publicar('campo', `Datos Fiscales: ${resultado.detalle}`, seccion.id);
  } else {
    publicar('error', `Datos Fiscales: ${resultado.detalle}. Complétalo a mano.`, seccion.id);
  }
}

/**
 * SEPOMEX lo hace el vendedor: la corrida avisa con qué buscar y espera a que el
 * CP de la sección (readonly, solo lo llena esa ventana) tenga valor. Sin eso,
 * «Validar Datos» rechazaría la sección y todo lo siguiente quedaría bloqueado.
 */
async function esperarColoniaManual(seccion, expediente, minutos = 10) {
  const { cp, que, pista } = seccion.colonia;
  const campoCp = document.getElementById(cp);
  if (!campoCp) {
    publicar('error', `No se encontró el campo de CP (${cp}). Elige la colonia y valida a mano.`, seccion.id);
    return false;
  }
  if (String(campoCp.value ?? '').trim()) return true;

  const datos = [
    pista?.cp && valorEn(expediente, pista.cp) ? `CP ${valorEn(expediente, pista.cp)}` : '',
    pista?.colonia && valorEn(expediente, pista.colonia)
      ? `colonia ${valorEn(expediente, pista.colonia)}`
      : '',
  ]
    .filter(Boolean)
    .join(', ');
  publicar(
    'aviso',
    `Elige la colonia de ${que} en SEPOMEX${datos ? ` (${datos})` : ''}. ` +
      'La extensión sigue sola en cuanto aparezca el código postal.',
    seccion.id,
  );

  const limite = Date.now() + minutos * 60 * 1000;
  for (;;) {
    if (String(document.getElementById(cp)?.value ?? '').trim()) {
      publicar('campo', `Colonia de ${que}: lista.`, seccion.id);
      await pausa(500);
      return true;
    }
    if (Date.now() >= limite) {
      publicar(
        'error',
        `Pasaron ${minutos} minutos sin colonia para ${que}. La corrida se detiene aquí; sigue a mano.`,
        seccion.id,
      );
      return false;
    }
    await pausa(1000);
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

async function esperarSeccionHabilitada(seccion, segundos = 25) {
  const primero = [...(seccion.inicio ?? []), ...seccion.campos].find(
    (campo) => campo.tipo !== 'checkbox' && campo.tipo !== 'radio',
  );
  if (!primero) return true;

  const limite = Date.now() + segundos * 1000;
  for (;;) {
    if (utilizable(document.getElementById(primero.id))) return true;
    if (Date.now() >= limite) return false;
    await pausa(250);
  }
}

async function llenar(expedienteRecibido) {
  if (llenando) return;
  llenando = true;
  capturarAvisos(true);
  preguntaPendiente = null;

  // Lo que se deduce del expediente y no viene escrito en él.
  const expediente = {
    ...expedienteRecibido,
    derivado: { planDePago: PLAN_POR_ESQUEMA[expedienteRecibido?.manual?.esquemaVenta] ?? '' },
  };

  try {
    publicar('inicio', 'Cargando la captura de Dinamo…');

    for (const seccion of SECCIONES) {
      // Las referencias 2 y 3 solo existen en el expediente cuando el esquema
      // las pide; si no vienen, la sección ni se abre.
      if (seccion.requiere && !existeEn(expediente, seccion.requiere)) continue;

      publicar('seccion', `— ${seccion.etiqueta} —`, seccion.id);

      // Las referencias 2 y 3 se abren marcando su casilla.
      if (seccion.activar) document.getElementById(seccion.activar)?.click();

      if (!(await esperarSeccionHabilitada(seccion))) {
        publicar(
          'error',
          `La sección «${seccion.etiqueta}» no se habilitó. La corrida se detiene aquí; ` +
            'revisa la pantalla y continúa a mano desde este punto.',
          seccion.id,
        );
        break;
      }

      // Lo que Dinamo exige primero (el RFC), luego Datos Fiscales, luego el resto.
      for (const campo of seccion.inicio ?? []) {
        await llenarCampo(campo, expediente, seccion.id);
      }
      if (seccion.datosFiscales) await pasarPorDatosFiscales(seccion);

      for (const campo of seccion.campos) {
        await llenarCampo(campo, expediente, seccion.id);
      }

      if (seccion.accesorio) await marcarAccesorio(seccion.accesorio, seccion.id);
      if (seccion.colonia && !(await esperarColoniaManual(seccion, expediente))) break;
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
    if (error instanceof PreguntaDeDinamo) {
      publicar(
        'error',
        `Dinamo preguntó «${error.message}». La extensión no contesta preguntas: ` +
          'respóndela tú en la pantalla y sigue a mano desde ahí.',
      );
      publicar('fin', 'La corrida se detuvo en una pregunta de Dinamo.');
    } else {
      publicar('error', `El llenado se interrumpió: ${error.message}`);
      publicar('fin', 'La corrida terminó con errores.');
    }
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
