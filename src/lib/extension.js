// Protocolo con la extensión de Edge.
//
// Adaptado de `marga-1.5/src/lib/buro/extension.js`. La extensión marca su
// presencia con un atributo en <html>, así que detectarla es síncrono y no
// cuesta una petición.
//
// Este módulo no se prueba con node:test a propósito: todo lo que hace es
// `postMessage` entre contextos del navegador, y jsdom no implementa
// `event.source`, así que las pruebas darían falsos negativos. El README de
// buro-extension documenta ese mismo tropiezo. Se verifica con la extensión
// instalada y con `pruebas/captura-simulada.html`.

const MARCA = 'data-dinamo-extension';

/** ¿Está instalada la extensión en este navegador? */
export function extensionDisponible() {
  return document.documentElement.hasAttribute(MARCA);
}

/** Versión de la extensión instalada, o null. */
export function versionExtension() {
  return document.documentElement.getAttribute(MARCA);
}

/**
 * Pide a la extensión que llene Dinamo y entrega los eventos de avance.
 *
 * Los eventos tienen la forma { tipo, mensaje, seccion, campo, valor }, donde
 * tipo es inicio, seccion, campo, aviso, error o fin. Resuelve al llegar `fin`.
 */
export function llenarConExtension(expediente, alRecibir, señal) {
  return new Promise((resolver) => {
    function alMensaje(evento) {
      if (evento.source !== window) return;
      const dato = evento.data;
      if (!dato || dato.fuente !== 'dinamo-extension' || dato.tipo !== 'evento') return;

      alRecibir(dato.evento);
      if (dato.evento.tipo === 'fin') terminar();
    }

    function terminar() {
      window.removeEventListener('message', alMensaje);
      señal?.removeEventListener('abort', terminar);
      resolver();
    }

    window.addEventListener('message', alMensaje);
    señal?.addEventListener('abort', terminar, { once: true });

    window.postMessage(
      { fuente: 'captura-automatizador', tipo: 'iniciar-llenado', expediente },
      window.location.origin,
    );
  });
}
