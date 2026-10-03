// Coordina las dos pestañas: la de la app y la de la captura de Dinamo.
//
// No hay servidor, ni puerto, ni CORS: todo pasa por mensajes entre pestañas.

// La pantalla de captura, abierta directa y no dentro de frame_principal.php:
// los content scripts solo corren en el marco de arriba (no hay `all_frames`),
// así que dentro del marco general nunca se enteraban de la captura.
const URL_CAPTURA_DEFECTO =
  'http://dinamo2.intranet/dscn/dscframe/Nwcreditoscj/dsc_captura_2022.php?tipo_captura=CREDINAMO';

// --- La pestaña de captura ---------------------------------------------------

async function urlCaptura() {
  const { urlCaptura: guardada } = await chrome.storage.local.get('urlCaptura');
  return guardada || URL_CAPTURA_DEFECTO;
}

/**
 * La moto la captura el vendedor a mano; la extensión sigue desde los datos del
 * cliente. Por eso la pestaña de captura NUNCA se recarga: se perdería la moto.
 *
 * - Ya abierta: se le pide a su contenido que empiece ahí mismo.
 * - No abierta: se abre y se le pide al vendedor capturar la moto y volver a
 *   presionar «Llenar en Dinamo». No se llena nada en esa vuelta.
 */
async function abrirCaptura(idPestanaApp, expediente) {
  const url = await urlCaptura();
  const base = url.split('?')[0];
  const [abierta] = await chrome.tabs.query({ url: `${base}*` });

  if (!abierta) {
    const nueva = await chrome.tabs.create({ url, active: true });
    await chrome.windows.update(nueva.windowId, { focused: true });
    entregarALaApp(idPestanaApp, {
      tipo: 'aviso',
      mensaje:
        'Se abrió la captura de Dinamo. Captura ahí el tipo de venta y la moto; luego vuelve ' +
        'y presiona «Llenar en Dinamo» otra vez.',
    });
    entregarALaApp(idPestanaApp, { tipo: 'fin', mensaje: 'Esperando a que captures la moto.' });
    return nueva.id;
  }

  await chrome.tabs.update(abierta.id, { active: true });
  await chrome.windows.update(abierta.windowId, { focused: true });
  await chrome.tabs.sendMessage(abierta.id, { tipo: 'iniciar-llenado', expediente, idPestanaApp });
  return abierta.id;
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
  if (mensaje?.tipo === 'evento-llenado') {
    if (mensaje.idPestanaApp !== undefined) entregarALaApp(mensaje.idPestanaApp, mensaje.evento);
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
