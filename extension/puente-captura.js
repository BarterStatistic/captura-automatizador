// Puente entre la app web y la extensión.
//
// La app no puede hablarle directo a la extensión: son mundos distintos. Este
// script vive en la página, escucha sus `postMessage` y los traduce a mensajes
// de la extensión, y de vuelta.

const MARCA = 'data-dinamo-extension';

// Bandera para que la app sepa que la extensión está instalada sin preguntar ni
// esperar. Se pone dos veces porque el content script puede correr antes de que
// exista el <html> definitivo.
function marcar() {
  document.documentElement.setAttribute(MARCA, chrome.runtime.getManifest().version);
}
marcar();
window.addEventListener('DOMContentLoaded', marcar);

function responderALaApp(evento) {
  window.postMessage({ fuente: 'dinamo-extension', tipo: 'evento', evento }, window.location.origin);
}

function fallar(mensaje) {
  responderALaApp({ tipo: 'error', mensaje, seccion: null, campo: null, valor: null });
  responderALaApp({ tipo: 'fin', mensaje: 'La corrida terminó con errores.' });
}

// --- App → extensión ----------------------------------------------------------

window.addEventListener('message', (evento) => {
  if (evento.source !== window) return;
  const dato = evento.data;
  if (!dato || dato.fuente !== 'captura-automatizador') return;

  if (dato.tipo === 'iniciar-llenado') {
    chrome.runtime
      .sendMessage({ tipo: 'iniciar-llenado', expediente: dato.expediente })
      .then((respuesta) => {
        if (!respuesta?.ok) fallar(respuesta?.error || 'La extensión no pudo abrir Dinamo.');
      })
      .catch((error) => fallar(`La extensión no respondió: ${error.message}`));
  }
});

// --- Extensión → app ----------------------------------------------------------

chrome.runtime.onMessage.addListener((mensaje) => {
  if (mensaje?.tipo === 'evento-llenado') responderALaApp(mensaje.evento);
  return false;
});
