// Corre en el contexto de la propia página (world: MAIN), no en el mundo
// aislado de la extensión. Es la única forma de ver los avisos que dispara
// Dinamo, que usa tres mecanismos distintos:
//
//   - 21 `alert()` nativos
//   - 11 `Swal.fire` de SweetAlert2
//   - `window.confirm` en la ventana de SEPOMEX, al elegir la colonia
//
// Solo se interviene MIENTRAS la extensión está llenando. Fuera de ese rato el
// usuario ve sus avisos normales: si el sistema le advierte algo cuando está
// capturando a mano, tiene que enterarse.

(() => {
  const alertOriginal = window.alert;
  const confirmOriginal = window.confirm;
  let capturando = false;

  function publicar(texto) {
    window.postMessage(
      { fuente: 'dinamo-hook', tipo: 'aviso', texto: String(texto ?? '') },
      window.location.origin,
    );
  }

  window.alert = function (mensaje) {
    if (!capturando) return alertOriginal.call(window, mensaje);
    // Se reporta y se traga: un modal congelaría la corrida a medio camino, y
    // el texto ya viaja a la bitácora.
    publicar(mensaje);
    return undefined;
  };

  window.confirm = function (mensaje) {
    if (!capturando) return confirmOriginal.call(window, mensaje);
    // SEPOMEX pregunta «¿Seleccionar la colonia y CP?» cuando el vendedor
    // eligió una colonia mientras la extensión llenaba. Decir que sí es la
    // continuación de lo que él mismo hizo, no una decisión nueva.
    publicar(mensaje);
    return true;
  };

  // SweetAlert2 no pasa por window.alert: dibuja un modal en el DOM. Se revisa
  // cada 200 ms mientras se llena, en vez de observar solo cuándo se agrega el
  // contenedor: Dinamo encadena Swal (homoclave → cuenta bancaria → RFC
  // genérico) y el segundo puede reusar el mismo modal sin agregar nodos.
  //
  // - Aviso de un solo botón: se anota y se cierra, para que la corrida siga.
  // - Pregunta (trae botón de «NO» o de cancelar): se anota y NO se contesta.
  //   Responderla cambia el trámite (p. ej. facturar con RFC genérico), así que
  //   la contesta una persona; la corrida sigue y la deja en el resumen.
  let ultimoSwal = '';

  function revisarSwal() {
    const modal = document.querySelector('.swal2-container .swal2-popup.swal2-show, .swal2-container .swal2-popup');
    if (!modal || !modal.isConnected || modal.getClientRects().length === 0) {
      ultimoSwal = '';
      return;
    }

    const texto = [modal.querySelector('.swal2-title'), modal.querySelector('.swal2-html-container')]
      .map((nodo) => nodo?.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    if (!texto || texto === ultimoSwal) return;
    ultimoSwal = texto;

    const muestra = (boton) => boton && boton.getClientRects().length > 0 && boton.style.display !== 'none';
    const esPregunta =
      muestra(modal.querySelector('.swal2-deny')) || muestra(modal.querySelector('.swal2-cancel'));

    if (esPregunta) {
      window.postMessage({ fuente: 'dinamo-hook', tipo: 'pregunta', texto }, window.location.origin);
      return;
    }

    publicar(texto);
    modal.querySelector('.swal2-confirm')?.click();
  }

  setInterval(() => {
    if (capturando) revisarSwal();
  }, 200);

  window.addEventListener('message', (evento) => {
    if (evento.source !== window) return;
    const dato = evento.data;
    if (dato?.fuente === 'dinamo-contenido' && dato.tipo === 'capturar-avisos') {
      capturando = Boolean(dato.activo);
    }
  });
})();
