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
    // SEPOMEX pregunta «¿Seleccionar la colonia y CP?» justo cuando la
    // extensión ya eligió la que coincide con el documento. Decir que sí es la
    // continuación del paso, no una decisión nueva.
    publicar(mensaje);
    return true;
  };

  // SweetAlert2 no pasa por window.alert: dibuja un modal en el DOM. Se observa
  // su aparición y se lee el texto.
  const observador = new MutationObserver((mutaciones) => {
    if (!capturando) return;
    for (const mutacion of mutaciones) {
      for (const nodo of mutacion.addedNodes) {
        if (nodo.nodeType !== 1) continue;
        const contenedor = nodo.matches?.('.swal2-container')
          ? nodo
          : nodo.querySelector?.('.swal2-container');
        if (!contenedor) continue;

        const texto = contenedor.querySelector('.swal2-html-container, .swal2-title')?.textContent;
        publicar(texto);

        // Se cierra sola para que la corrida siga; el aviso ya quedó anotado.
        contenedor.querySelector('.swal2-confirm')?.click();
      }
    }
  });
  observador.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('message', (evento) => {
    if (evento.source !== window) return;
    const dato = evento.data;
    if (dato?.fuente === 'dinamo-contenido' && dato.tipo === 'capturar-avisos') {
      capturando = Boolean(dato.activo);
    }
  });
})();
