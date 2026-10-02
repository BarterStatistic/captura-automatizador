// Coordina las tres clases de pestaña: la de la app, la de la captura de
// Dinamo, y las dos emergentes (SEPOMEX y Datos Fiscales) que la captura abre.
//
// No hay servidor, ni puerto, ni CORS: todo pasa por mensajes entre pestañas.

// La pantalla de captura, abierta directa y no dentro de frame_principal.php:
// los content scripts solo corren en el marco de arriba (no hay `all_frames`),
// así que dentro del marco general nunca se enteraban de la captura.
const URL_CAPTURA_DEFECTO =
  'http://dinamo2.intranet/dscn/dscframe/Nwcreditoscj/dsc_captura_2022.php?tipo_captura=CREDINAMO';

// --- Trabajo pendiente por pestaña -------------------------------------------

async function guardar(clave, valor) {
  await chrome.storage.session.set({ [clave]: valor });
}

async function tomar(clave) {
  const guardado = await chrome.storage.session.get(clave);
  return guardado[clave] ?? null;
}

async function urlCaptura() {
  const { urlCaptura: guardada } = await chrome.storage.local.get('urlCaptura');
  return guardada || URL_CAPTURA_DEFECTO;
}

/** Abre la captura, reusando una pestaña que ya esté en el sistema. */
async function abrirCaptura(idPestanaApp, expediente) {
  const url = await urlCaptura();
  const base = url.split('?')[0];

  const abiertas = await chrome.tabs.query({ url: `${base}*` });
  const pestana = abiertas.length
    ? await chrome.tabs.update(abiertas[0].id, { url, active: true })
    : await chrome.tabs.create({ url, active: true });

  await guardar(`pendiente-${pestana.id}`, { expediente, idPestanaApp });
  // Las emergentes preguntan por el expediente de su pestaña madre, así que se
  // guarda aparte: el pendiente se consume al empezar y ellas nacen después.
  await guardar(`expediente-${pestana.id}`, expediente);
  await chrome.windows.update(pestana.windowId, { focused: true });
  return pestana.id;
}

chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
  // --- Desde la app ----------------------------------------------------------
  if (mensaje?.tipo === 'iniciar-llenado') {
    abrirCaptura(remitente.tab.id, mensaje.expediente)
      .then(() => responder({ ok: true }))
      .catch((error) => responder({ ok: false, error: error.message }));
    return true;
  }

  // --- Desde la pestaña de captura -------------------------------------------
  if (mensaje?.tipo === 'listo-para-llenar') {
    const clave = `pendiente-${remitente.tab.id}`;
    tomar(clave)
      .then(async (registro) => {
        if (!registro) return responder({});
        // Se consume: si alguien recarga Dinamo a mano, no vuelve a llenarse
        // solo a sus espaldas.
        await chrome.storage.session.remove(clave);
        responder(registro);
      })
      .catch(() => responder({}));
    return true;
  }

  if (mensaje?.tipo === 'evento-llenado') {
    if (mensaje.idPestanaApp !== undefined) entregarALaApp(mensaje.idPestanaApp, mensaje.evento);
    return false;
  }

  // --- Desde una ventana emergente -------------------------------------------
  // Nacen con `openerTabId` apuntando a la captura, así que saben de quién son
  // sin que nadie tenga que decírselo.
  if (mensaje?.tipo === 'listo-emergente') {
    const idMadre = remitente.tab.openerTabId;
    if (idMadre === undefined) return responder({});
    tomar(`expediente-${idMadre}`)
      .then((expediente) => responder({ expediente, idMadre }))
      .catch(() => responder({}));
    return true;
  }

  if (mensaje?.tipo === 'emergente-terminada') {
    const idMadre = remitente.tab.openerTabId;
    if (idMadre !== undefined) {
      chrome.tabs
        .sendMessage(idMadre, {
          tipo: 'emergente-terminada',
          cual: mensaje.cual,
          ok: mensaje.ok,
          detalle: mensaje.detalle,
        })
        .catch(() => {});
    }
    return false;
  }

  return false;
});

// --- Entrega de eventos a la app ---------------------------------------------

// Una cola por pestaña de la app. Los eventos se entregan de uno en uno y en
// orden: si el primero está reintentando, el segundo espera. Sin esto, un
// evento reintentado llega después de los que venían detrás y la bitácora
// cuenta la corrida desordenada.
const colas = new Map();

function entregarALaApp(idPestanaApp, evento) {
  const anterior = colas.get(idPestanaApp) ?? Promise.resolve();
  const siguiente = anterior.then(() => intentarEntrega(idPestanaApp, evento));
  colas.set(idPestanaApp, siguiente);

  if (evento.tipo === 'fin') siguiente.then(() => colas.delete(idPestanaApp));
}

/**
 * Entrega un evento, reintentando.
 *
 * Hace falta porque al abrir Dinamo la app pierde el foco, y durante ese
 * momento `sendMessage` puede rechazar. En buro-extension eso se tragaba en
 * silencio y los primeros campos nunca se marcaban como escritos, aunque sí se
 * hubieran escrito.
 */
async function intentarEntrega(idPestanaApp, evento, intentos = 4) {
  for (let i = 0; i < intentos; i += 1) {
    try {
      await chrome.tabs.sendMessage(idPestanaApp, { tipo: 'evento-llenado', evento });
      return;
    } catch (error) {
      if (i === intentos - 1) {
        // Que quede rastro: un evento perdido en silencio es justo lo que hizo
        // ese bug tan difícil de ver.
        console.warn('Captura Automatizador: no se pudo entregar el evento', evento, error);
        return;
      }
      await new Promise((seguir) => setTimeout(seguir, 150));
    }
  }
}

// Sin esto, storage.session junta basura de pestañas muertas.
chrome.tabs.onRemoved.addListener((idPestana) => {
  chrome.storage.session.remove([`pendiente-${idPestana}`, `expediente-${idPestana}`]);
});
