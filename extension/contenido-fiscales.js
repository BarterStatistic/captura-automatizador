// Las dos páginas de Datos Fiscales que abre `showFiscal()` en otra pestaña.
//
//   datosFiscalesCliente.php       RFC sin datos fiscales: se llena y se guarda.
//   consultarClientesFiscales.php  RFC con datos fiscales: se ACEPTA el registro
//                                  existente («Marcar como válidos»). Nunca se
//                                  modifica.
//
// Solo actúa si la pestaña la abrió la corrida (la captura pidió el expediente
// justo antes de presionar el botón). Una pestaña que abrió una persona no se
// toca.
//
// Dos cosas que costaría caro pasar por alto:
//
//   - `btnGuardarDatos` NO es guardar: en un cliente que ya tenía datos es el
//     botón de Cancelar. Por eso el botón se busca por su onclick.
//   - Régimen y uso de CFDI llegan por AJAX y se REEMPLAZAN al cambiar el tipo
//     de persona y el régimen. Elegir antes de que lleguen deja el valor en una
//     lista que la página tira a los pocos milisegundos.

const ES_CONSULTA = /consultarClientesFiscales\.php/i.test(window.location.pathname);

let avisosDeLaPagina = [];

window.addEventListener('message', (evento) => {
  if (evento.source !== window) return;
  if (evento.data?.fuente !== 'dinamo-hook') return;
  if (evento.data.tipo === 'aviso' || evento.data.tipo === 'pregunta') {
    avisosDeLaPagina.push(evento.data.texto);
  }
});

function terminar(ok, detalle) {
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

/** El datepicker de Dinamo espera dd/mm/aaaa. */
function fechaDeHoy() {
  const hoy = new Date();
  const dos = (numero) => String(numero).padStart(2, '0');
  return `${dos(hoy.getDate())}/${dos(hoy.getMonth() + 1)}/${hoy.getFullYear()}`;
}

/** Sin acentos ni mayúsculas, para comparar colonias. */
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Espera a que la página REEMPLACE las opciones de un select (su AJAX hace
 * `.html(respuesta)`, que crea nodos nuevos). `antes` es una opción de la lista
 * vieja: mientras siga en el select, la respuesta todavía no llegó.
 *
 * Devuelve `false` si se agotó el tiempo, para que quede en el reporte en vez de
 * escribir sobre una lista que la página está por tirar.
 */
async function esperarReemplazo(select, antes, segundos = 8) {
  const limite = Date.now() + segundos * 1000;
  for (;;) {
    const hay = select.options.length > 0;
    const sigueIgual = antes ? [...select.options].includes(antes) : false;
    if (hay && !sigueIgual) return true;
    if (Date.now() >= limite) return false;
    await pausa(150);
  }
}

/** Elige un valor de un select cuyo catálogo llega por AJAX tras `cambiar()`. */
async function elegirTrasAjax(select, valor, cambiar) {
  const antes = select.options[1] ?? select.options[0] ?? null;
  cambiar();
  const llego = await esperarReemplazo(select, antes);
  const opcion = [...select.options].find((o) => o.value === String(valor));
  if (!opcion) {
    throw new Error(
      `no existe la opción «${valor}»${llego ? '' : ' (el catálogo no llegó a tiempo)'}`,
    );
  }
  return aplicarSeleccion(select, opcion);
}

async function llenarFormulario(expediente, anotados) {
  // Sin esto todos los campos siguen deshabilitados: `activaCM(2)` abre la
  // captura manual.
  const manual = document.getElementById('radioM');
  if (!manual) throw new Error('no apareció la opción de captura manual');
  manual.click();
  await esperarCampo(FISCALES.campos[0].id, 5);

  // RFC y razón social primero: sin ellos no hay trámite.
  for (const campo of FISCALES.campos) {
    const valor = valorEn(expediente, campo.de);
    if (!valor.trim()) {
      if (!campo.opcional) anotados.push(`${campo.etiqueta} no venía en los documentos`);
      continue;
    }
    try {
      const elemento = await esperarCampo(campo.id, 5);
      const quedo = escribirTexto(elemento, valor);
      if (quedo !== valor) anotados.push(`${campo.etiqueta} quedó como «${quedo}»`);
      // El RFC se valida al cambiar (validarRFC → #rfcValidado).
      if (campo.id === 'txtRFC') await pausa(700);
    } catch (error) {
      anotados.push(`${campo.etiqueta}: ${error.message}`);
    }
    await pausa(150);
  }

  if (/inv[aá]lido/i.test(document.getElementById('rfcValidado')?.textContent ?? '')) {
    throw new Error('Dinamo marcó el RFC como inválido');
  }

  // Tipo de persona → régimen → uso de CFDI, cada uno esperando el AJAX del
  // anterior.
  const tipo = document.getElementById(FISCALES.tipoPersona.id);
  const regimen = document.getElementById(FISCALES.regimen.id);
  const uso = document.getElementById(FISCALES.uso.id);
  if (!tipo || !regimen || !uso) throw new Error('faltan los selectores de persona, régimen o uso');

  await elegirTrasAjax(regimen, FISCALES.regimen.valor, () =>
    seleccionarPorValue(tipo, FISCALES.tipoPersona.valor),
  );
  await elegirTrasAjax(uso, FISCALES.uso.valor, () => {
    regimen.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // La fecha de emisión es obligatoria y no sale de ningún documento: se pone la
  // de hoy, que es lo que Dinamo acepta.
  try {
    escribirTexto(await esperarCampo('txtFechaEmision', 5), fechaDeHoy());
  } catch {
    anotados.push('no se pudo escribir la fecha de emisión');
  }
}

/**
 * La dirección fiscal se elige de un catálogo que depende del CP. Si ninguna
 * coincide con la colonia del comprobante NO se adivina: el select trae una
 * opción marcada por defecto y Dinamo la aceptaría sin protestar.
 */
async function elegirDireccion(expediente) {
  const buscar = botonPorOnclick(FISCALES.buscarDireccion);
  if (!buscar) return { ok: false, motivo: 'no se encontró el botón Buscar Dirección' };

  const select = document.getElementById(FISCALES.direccion.id);
  if (!select) return { ok: false, motivo: 'no apareció el catálogo de direcciones' };

  const antes = select.options[0] ?? null;
  buscar.click();
  if (!(await esperarReemplazo(select, antes, 10))) {
    return { ok: false, motivo: 'el catálogo de direcciones no cargó' };
  }

  const colonia = normalizar(valorEn(expediente, FISCALES.direccion.colonia));
  if (!colonia) return { ok: false, motivo: 'el comprobante no trae colonia' };

  const opcion = [...select.options].find((o) => normalizar(o.text).includes(colonia));
  if (!opcion) {
    return { ok: false, motivo: `ninguna dirección fiscal coincide con la colonia «${colonia}»` };
  }
  aplicarSeleccion(select, opcion);
  return { ok: true };
}

async function trabajarFormulario(expediente) {
  const anotados = [];
  await llenarFormulario(expediente, anotados);

  const direccion = await elegirDireccion(expediente);
  if (!direccion.ok) {
    terminar(
      false,
      `${direccion.motivo}. Elige la dirección fiscal y presiona Guardar en esta pestaña` +
        `${anotados.length ? ` (además: ${anotados.join('; ')})` : ''}`,
    );
    return;
  }

  if (anotados.length > 0) {
    terminar(false, `faltó: ${anotados.join('; ')}. Complétalo y presiona Guardar en esta pestaña`);
    return;
  }

  // Si el RFC de la captura no coincide con el que se va a guardar, Dinamo
  // pregunta si sustituye los datos del cliente; la extensión no contesta eso.
  const rfcCaptura = String(window.opener?.document?.getElementById('txtrfc')?.value ?? '').trim();
  const rfcFiscal = String(document.getElementById('txtRFC')?.value ?? '').trim();
  if (rfcCaptura && rfcCaptura.toUpperCase() !== rfcFiscal.toUpperCase()) {
    terminar(false, 'el RFC de la captura y el fiscal no coinciden; revísalo antes de guardar');
    return;
  }

  const guardar = [...document.querySelectorAll('input[type="button"], button')].find((boton) =>
    String(boton.getAttribute('onclick') ?? '').includes(FISCALES.guardar),
  );
  if (!guardar || guardar.disabled) {
    terminar(false, 'no se encontró el botón de Guardar (validarDatosAEnviar); presiónalo tú');
    return;
  }

  avisosDeLaPagina = [];
  guardar.click();
  await pausa(2000);

  // Si Dinamo rechazó algo (falta un campo, RFC inválido…) el aviso llega aquí
  // y la pestaña sigue abierta. Si guardó, la pestaña suele cerrarse sola y este
  // mensaje no llega: la captura lo sabe por el cierre.
  if (avisosDeLaPagina.length > 0) {
    terminar(false, `Dinamo dijo «${avisosDeLaPagina.join(' / ')}»; corrígelo y presiona Guardar`);
    return;
  }
  terminar(true, 'se presionó Guardar');
}

/**
 * El RFC ya tiene datos fiscales: se ACEPTA el registro existente con el ícono de
 * «Marcar como válidos» (`relacionar_cte_existente`). No se edita nada.
 *
 * Si hay más de un registro con ese RFC se elige el de la misma razón social; si
 * tampoco así queda uno solo, no se adivina: lo decide una persona.
 */
async function trabajarConsulta(expediente) {
  const rfc = normalizar(valorEn(expediente, 'datos.cliente.rfc'));
  const razon = normalizar(valorEn(expediente, 'datos.cliente.razonSocial'));

  // La lista llega por AJAX al cargar la página.
  const limite = Date.now() + 8000;
  let filas = [];
  while (Date.now() < limite) {
    filas = [...document.querySelectorAll('td[iddatosfiscalestr]')].map((celda) => celda.parentElement);
    if (filas.length > 0) break;
    await pausa(200);
  }
  if (filas.length === 0) {
    terminar(false, 'no se pudo leer la lista de datos fiscales del cliente; acéptalos tú en esta pestaña');
    return;
  }

  const celdas = (fila) => [...fila.children].map((c) => normalizar(c.textContent));
  const delRfc = filas.filter((fila) => celdas(fila)[0] === rfc);
  const mismaRazon = delRfc.filter((fila) => celdas(fila)[1] === razon);
  const candidatas = delRfc.length === 1 ? delRfc : mismaRazon;

  if (candidatas.length !== 1) {
    terminar(
      false,
      delRfc.length === 0
        ? `la lista no trae el RFC ${rfc}; elige el registro que corresponda y acéptalo en esta pestaña`
        : `hay ${delRfc.length} registros con ese RFC y no se pudo saber cuál es; acepta el que corresponda`,
    );
    return;
  }

  const icono = [...candidatas[0].querySelectorAll('img, input, button, a')].find((el) =>
    String(el.getAttribute('onclick') ?? '').includes('relacionar_cte_existente('),
  );
  if (!icono) {
    terminar(false, 'ese registro no tiene el botón «Marcar como válidos»; acéptalo tú en esta pestaña');
    return;
  }

  avisosDeLaPagina = [];
  icono.click();
  await pausa(2000);

  // Si Dinamo avisó algo (o preguntó) la pestaña sigue abierta; si aceptó, suele
  // cerrarse sola y la captura lo sabe por el cierre.
  if (avisosDeLaPagina.length > 0) {
    terminar(false, `Dinamo dijo «${avisosDeLaPagina.join(' / ')}»; revísalo en esta pestaña`);
    return;
  }
  terminar(true, 'se aceptó el registro de datos fiscales existente');
}

async function trabajar() {
  const respuesta = await chrome.runtime.sendMessage({ tipo: 'listo-emergente' }).catch(() => null);
  const expediente = respuesta?.expediente;
  if (!expediente) return; // la abrió una persona: no se toca

  capturarAvisosAqui(true);
  try {
    if (ES_CONSULTA) await trabajarConsulta(expediente);
    else await trabajarFormulario(expediente);
  } catch (error) {
    terminar(false, `${error.message}. Complétalo a mano en esta pestaña`);
  } finally {
    capturarAvisosAqui(false);
  }
}

trabajar();
