// La ventana de SEPOMEX (`consulta_localidad.php`).
//
// Hace falta pasar por aquí porque en la captura `txtcolonia`, `txtcp`,
// `txtmpio` y `txtciudad` son `readonly`: no hay forma de teclearlos. La única
// vía es que esta ventana llame a `window.opener.devuelve_localidad(...)`.
//
// Se usa la búsqueda rápida de abajo, que consulta el catálogo oficial por AJAX
// (`ajax_outlet.php`). Así la colonia sale del catálogo, no de algo que arme la
// extensión.

const pausaSep = (ms) => new Promise((seguir) => setTimeout(seguir, ms));

/** El tipo de domicilio (CLI, EMP, REF…) lo dice la propia página. */
function tipoDeVentana() {
  return document.getElementById('txttipo')?.value ?? 'CLI';
}

function avisarAlPadre(ok, detalle) {
  chrome.runtime.sendMessage({ tipo: 'emergente-terminada', cual: 'sepomex', ok, detalle }).catch(() => {});
}

/** Activa el hook de avisos de ESTA ventana: tiene el suyo, independiente. */
function capturarAvisosAqui(activo) {
  window.postMessage(
    { fuente: 'dinamo-contenido', tipo: 'capturar-avisos', activo },
    window.location.origin,
  );
}

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Espera a que el AJAX escriba los resultados en #div_cp. */
async function esperarResultados(segundos = 15) {
  const limite = Date.now() + segundos * 1000;
  for (;;) {
    const caja = document.getElementById('div_cp');
    const filas = caja ? [...caja.querySelectorAll('[onclick*="selecciona("]')] : [];
    if (filas.length) return filas;
    if (Date.now() >= limite) return [];
    await pausaSep(250);
  }
}

/**
 * Elige la fila cuya colonia coincide con la del documento.
 *
 * Si ninguna coincide NO se elige nada: capturar una colonia que no es la del
 * cliente sería peor que dejar el paso a medias, y la persona lo termina en dos
 * clics con la ventana ya abierta y buscada.
 */
function filaQueCoincide(filas, colonia) {
  const objetivo = normalizar(colonia);
  if (!objetivo) return null;

  const exacta = filas.find((fila) => {
    const partes = String(fila.getAttribute('onclick')).split(';');
    return partes.some((parte) => normalizar(parte).replace(/['")]/g, '') === objetivo);
  });
  if (exacta) return exacta;

  return filas.find((fila) => normalizar(fila.textContent).includes(objetivo)) ?? null;
}

async function trabajar() {
  const respuesta = await chrome.runtime.sendMessage({ tipo: 'listo-emergente' }).catch(() => null);
  const expediente = respuesta?.expediente;
  if (!expediente) return; // la abrió una persona, no la extensión: no se toca

  capturarAvisosAqui(true);

  const tipo = tipoDeVentana();
  const esEmpleo = tipo === 'EMP';

  // Del trabajo casi nunca hay código postal: el formulario de WhatsApp da la
  // colonia y ya. Por eso ahí se busca por nombre.
  const buscarPor = esEmpleo ? 'COLONIA' : 'CP';
  const colonia = esEmpleo
    ? expediente?.datos?.empleo?.colonia
    : expediente?.datos?.domicilio?.colonia;
  const termino = esEmpleo ? colonia : expediente?.datos?.domicilio?.cp;

  if (!termino) {
    capturarAvisosAqui(false);
    avisarAlPadre(false, `no hay ${buscarPor.toLowerCase()} con qué buscar`);
    return;
  }

  try {
    const campo = document.getElementById('cbocampo');
    campo.value = buscarPor;
    campo.dispatchEvent(new Event('change', { bubbles: true }));

    const busqueda = document.getElementById('txtsearch');
    busqueda.value = String(termino);
    busqueda.dispatchEvent(new Event('input', { bubbles: true }));

    const boton = [...document.querySelectorAll('input[type="button"]')].find((entrada) =>
      String(entrada.getAttribute('onclick') ?? '').includes('buscar('),
    );
    if (!boton) throw new Error('no se encontró el botón Buscar');
    boton.click();

    const filas = await esperarResultados();
    if (!filas.length) {
      throw new Error(`la búsqueda por ${buscarPor} «${termino}» no devolvió colonias`);
    }

    const elegida = filaQueCoincide(filas, colonia);
    if (!elegida) {
      throw new Error(
        `ninguna de las ${filas.length} colonias coincide con «${colonia ?? ''}»; elígela tú`,
      );
    }

    // `selecciona()` pide confirmación con window.confirm, que el hook responde
    // que sí, y después cierra la ventana sola.
    const texto = normalizar(elegida.textContent).slice(0, 60);
    avisarAlPadre(true, `${texto} (${buscarPor} ${termino})`);
    elegida.click();
  } catch (error) {
    capturarAvisosAqui(false);
    avisarAlPadre(false, error.message);
  }
}

trabajar();
