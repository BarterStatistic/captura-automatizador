// La ventana de Datos Fiscales (`datosFiscalesCliente.php`).
//
// Un detalle que costaría caro pasar por alto: `btnGuardarDatos` NO es el botón
// de guardar. En un cliente que ya tenía datos fiscales, ese id es el de
// **Cancelar** (`onclick="cancelar()"`), y el que guarda es `btnModificarDatos`.
// Por eso aquí nunca se busca por id, sino por la función del onclick.

function avisar(ok, detalle) {
  chrome.runtime
    .sendMessage({ tipo: 'emergente-terminada', cual: 'fiscales', ok, detalle })
    .catch(() => {});
}

function capturarAvisosAqui(activo) {
  window.postMessage(
    { fuente: 'dinamo-contenido', tipo: 'capturar-avisos', activo },
    window.location.origin,
  );
}

/** El datepicker espera dd/mm/aaaa. */
function fechaDeHoy() {
  const hoy = new Date();
  const dos = (numero) => String(numero).padStart(2, '0');
  return `${dos(hoy.getDate())}/${dos(hoy.getMonth() + 1)}/${hoy.getFullYear()}`;
}

async function esperarDirecciones(segundos = 15) {
  const limite = Date.now() + segundos * 1000;
  for (;;) {
    const select = document.getElementById('cboDireccionFiscal');
    if (select && select.options.length > 0) return select;
    if (Date.now() >= limite) return null;
    await pausa(250);
  }
}

async function trabajar() {
  const respuesta = await chrome.runtime.sendMessage({ tipo: 'listo-emergente' }).catch(() => null);
  const expediente = respuesta?.expediente;
  if (!expediente) return; // la abrió una persona: no se toca

  capturarAvisosAqui(true);
  const anotados = [];

  try {
    // Sin esto todos los campos siguen deshabilitados: `activaCM(2)` es lo que
    // abre la captura manual.
    const manual = document.getElementById('radioM');
    if (!manual) throw new Error('no apareció la opción de captura manual');
    manual.click();
    await pausa(500);

    for (const campo of FISCALES.campos) {
      if (campo.tipo === 'radio') continue;

      const esFijo = campo.fijo !== undefined;
      let valor = esFijo ? campo.fijo : valorEn(expediente, campo.de);

      // El CP del comprobante manda; el 25000 es solo el respaldo cuando no se
      // pudo leer.
      if (campo.id === 'txtCodigoPostal' && !valor) valor = FISCALES.cpPorDefecto;

      if (!String(valor).trim()) {
        if (!campo.opcional) anotados.push(`${campo.etiqueta} quedó vacío`);
        continue;
      }

      try {
        const elemento = await esperarCampo(campo.id, 8);
        if (campo.tipo === 'select') seleccionarPorValue(elemento, valor);
        else escribirTexto(elemento, valor);
      } catch (error) {
        anotados.push(`${campo.etiqueta}: ${error.message}`);
      }
      await pausa(200);
    }

    // La fecha de emisión está marcada como obligatoria y no venía en el mapeo.
    try {
      const fecha = await esperarCampo('txtFechaEmision', 5);
      escribirTexto(fecha, fechaDeHoy());
    } catch {
      anotados.push('no se pudo escribir la fecha de emisión');
    }

    // El catálogo de direcciones se puebla a partir del CP.
    const buscar = botonPorOnclick(FISCALES.buscarDireccion);
    if (buscar) {
      buscar.click();
      const direcciones = await esperarDirecciones();
      if (direcciones) {
        const colonia = String(expediente?.datos?.domicilio?.colonia ?? '').toUpperCase();
        const opcion =
          [...direcciones.options].find((o) => colonia && o.text.toUpperCase().includes(colonia)) ??
          [...direcciones.options].find((o) => o.value === FISCALES.direccionPorDefecto);

        if (opcion) {
          direcciones.value = opcion.value;
          direcciones.dispatchEvent(new Event('change', { bubbles: true }));
          if (!colonia || !opcion.text.toUpperCase().includes(colonia)) {
            anotados.push(`la dirección fiscal no coincidió con «${colonia}»; revísala`);
          }
        } else {
          anotados.push('ninguna dirección fiscal coincidió; elígela a mano');
        }
      } else {
        anotados.push('el catálogo de direcciones no cargó');
      }
    } else {
      anotados.push('no se encontró el botón Buscar Dirección');
    }

    // Guardar. Nunca por id: btnGuardarDatos puede ser el botón de Cancelar.
    const guardar = botonPorOnclick(FISCALES.guardar);
    if (!guardar) {
      throw new Error(
        'no se encontró el botón de guardar (validarDatosAEnviar). No se tocó nada más.',
      );
    }

    capturarAvisosAqui(false);
    avisar(true, anotados.length ? `guardado con avisos: ${anotados.join('; ')}` : 'guardado');
    guardar.click();
  } catch (error) {
    capturarAvisosAqui(false);
    avisar(false, error.message);
  }
}

trabajar();
