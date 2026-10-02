// El mapeo de campos es lo más delicado de la extensión: un id equivocado
// captura un dato en el lugar de otro, y eso llega al expediente de crédito de
// una persona real. Todo lo de aquí está cotejado contra el HTML de Dinamo.
//
// `campos.js` es un script clásico (así lo carga el manifest, sin módulos), por
// eso se evalúa con `vm` en vez de importarlo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RUTA = fileURLToPath(new URL('../campos.js', import.meta.url));
const contexto = vm.createContext({});
vm.runInContext(readFileSync(RUTA, 'utf8'), contexto);

const { SECCIONES, valorEn, ACCESORIO_SERVICIO } = contexto;

const todosLosCampos = () => SECCIONES.flatMap((seccion) => seccion.campos);

// `vm` crea otro realm, así que sus arrays no comparten prototipo con los de
// aquí y deepEqual estricto los rechaza aunque el contenido sea idéntico.
// Copiarlos al realm de la prueba es lo que compara el contenido de verdad.
const local = (iterable) => Array.from(iterable);

test('las secciones van en el orden en que el formulario las habilita', () => {
  assert.deepEqual(
    local(SECCIONES.map((seccion) => seccion.id)),
    [
      'tipoVenta',
      'motocicleta',
      'cliente',
      'domicilio',
      'empleo',
      'referencia',
      'referencia2',
      'referencia3',
      'final',
    ],
  );
});

// --- La regla que no se negocia ----------------------------------------------

test('ninguna sección invoca valida(), que es el botón Grabar', () => {
  for (const seccion of SECCIONES) {
    assert.notEqual(
      seccion.validar,
      'valida',
      `la sección ${seccion.id} no puede presionar Grabar`,
    );
  }
});

test('la última sección no valida nada: ahí se detiene la corrida', () => {
  const final = SECCIONES.at(-1);

  assert.equal(final.validar, null);
  assert.equal(final.detenerse, true);
});

// --- Botones ------------------------------------------------------------------

test('cada sección se valida con la función del onclick, no con un XPath', () => {
  const esperado = {
    tipoVenta: 'nextStep',
    motocicleta: null,
    cliente: 'valida_cliente',
    domicilio: 'valida_domicilio',
    empleo: 'valida_empleo',
    referencia: 'valida_referencia',
    referencia2: 'valida_referencia_b',
    referencia3: 'valida_referencia_c',
    final: null,
  };

  for (const seccion of SECCIONES) {
    assert.equal(seccion.validar, esperado[seccion.id], `sección ${seccion.id}`);
  }
});

// --- Valores fijos verificados contra el HTML --------------------------------

test('los valores fijos son los del catálogo real', () => {
  const fijos = Object.fromEntries(
    todosLosCampos()
      .filter((campo) => campo.fijo !== undefined)
      .map((campo) => [campo.id, campo.fijo]),
  );

  assert.equal(fijos.cbomedio, '14'); // REDES SOCIALES
  assert.equal(fijos.cbovivienda, '2'); // RENTADA
  assert.equal(fijos.cbosector, '2'); // PRIVADO
  assert.equal(fijos.cbooficina, '2'); // EDIFICIO
  assert.equal(fijos.cbotipo_tel_emp, '5'); // CELULAR
  assert.equal(fijos.cmbStatusLabRef1, '2'); // OTRO
  assert.equal(fijos.cbotipo_ref, '1'); // Comercial/Personal
  assert.equal(fijos.cbohora_de, '10');
  assert.equal(fijos.cbohora_a, '12');
  assert.equal(fijos.cbohora_de_emp, '16');
  assert.equal(fijos.cbohora_a_emp, '18');
  assert.equal(fijos.txtpuesto, 'trabajador');
  assert.equal(fijos.txtCentroLabRef1, 'trabajador');
  assert.equal(fijos.txtcomenta, 'OK');
});

test('las casillas de verificación van siempre marcadas', () => {
  const casillas = todosLosCampos().filter((campo) => campo.tipo === 'checkbox');

  assert.deepEqual(
    local(casillas.map((campo) => campo.id).sort()),
    ['check_cli_A', 'check_emp_A', 'check_ref_A', 'check_ref_b_A', 'check_ref_c_A'],
  );
  assert.ok(casillas.every((campo) => campo.fijo === true));
});

test('el accesorio de servicio se localiza por código de producto', () => {
  assert.equal(ACCESORIO_SERVICIO.codigo, '590144001');
  assert.match(ACCESORIO_SERVICIO.descripcion, /SERVICIO PREVENTIVO 1/);
});

// --- Los campos que no se pueden teclear -------------------------------------

test('los campos readonly de SEPOMEX no se intentan escribir', () => {
  const ids = todosLosCampos().map((campo) => campo.id);

  for (const readonly of ['txtcolonia', 'txtcp', 'txtmpio', 'txtciudad', 'facturaRFCSDF']) {
    assert.ok(!ids.includes(readonly), `${readonly} es readonly: no se escribe`);
  }
});

test('el domicilio y el empleo abren SEPOMEX, y dicen con qué buscar', () => {
  const domicilio = SECCIONES.find((s) => s.id === 'domicilio');
  const empleo = SECCIONES.find((s) => s.id === 'empleo');

  assert.equal(domicilio.sepomex.tipo, 'CLI');
  assert.equal(domicilio.sepomex.buscarPor, 'CP');

  // El formulario de WhatsApp da colonia pero casi nunca código postal.
  assert.equal(empleo.sepomex.tipo, 'EMP');
  assert.equal(empleo.sepomex.buscarPor, 'COLONIA');
});

// --- Lectura de valores del expediente ---------------------------------------

test('valorEn recorre la ruta del expediente', () => {
  const expediente = { datos: { cliente: { curp: 'PEGJ900115HCLRMN08' } } };

  assert.equal(valorEn(expediente, 'datos.cliente.curp'), 'PEGJ900115HCLRMN08');
});

test('valorEn devuelve cadena vacía cuando la ruta no existe', () => {
  assert.equal(valorEn({}, 'datos.cliente.curp'), '');
  assert.equal(valorEn({ datos: {} }, 'datos.cliente.curp'), '');
});

test('cada campo sabe de dónde sale su valor', () => {
  for (const campo of todosLosCampos()) {
    const tieneOrigen = campo.fijo !== undefined || typeof campo.de === 'string';
    assert.ok(tieneOrigen, `el campo ${campo.id} no dice de dónde sale su valor`);
    assert.ok(campo.etiqueta, `el campo ${campo.id} necesita etiqueta para la bitácora`);
  }
});

test('el plazo se elige por su número, no por la clave interna', () => {
  const plazo = todosLosCampos().find((campo) => campo.id === 'cboplazo');

  assert.equal(plazo.tipo, 'selectNumero');
  assert.equal(plazo.de, 'manual.plazo');
});

// --- Contra el HTML real -------------------------------------------------------
// `ids-dinamo.json` es la lista de controles de dsc_captura_2022.php, sacada del
// HTML que guardó Braulio el 2026-10-02 (sin valores de clientes). Si Dinamo
// renombra un campo, esto falla antes de que la extensión escriba en el vacío.

const DINAMO = JSON.parse(
  readFileSync(fileURLToPath(new URL('./ids-dinamo.json', import.meta.url)), 'utf8'),
);

test('cada campo que llena la extensión existe en el HTML real de Dinamo', () => {
  const faltan = todosLosCampos()
    .map((campo) => campo.id)
    .filter((id) => !(id in DINAMO.controles));

  assert.deepEqual(local(faltan), []);
});

test('ningún campo de solo lectura se intenta escribir', () => {
  const soloLectura = todosLosCampos()
    .map((campo) => campo.id)
    .filter((id) => DINAMO.controles[id]?.readonly);

  assert.deepEqual(local(soloLectura), []);
});

test('cada botón que se presiona existe en la página', () => {
  const funciones = SECCIONES.flatMap((seccion) => [seccion.validar, seccion.validarEmail])
    .concat(SECCIONES.map((seccion) => seccion.buscarCliente?.boton))
    .concat(SECCIONES.map((seccion) => seccion.datosFiscales?.boton))
    .filter(Boolean);

  for (const funcion of funciones) {
    assert.ok(
      DINAMO.onclicks.some((onclick) => onclick.includes(`${funcion}(`)),
      `no hay botón con ${funcion}()`,
    );
  }
});

test('cada SEPOMEX que se abre tiene su enlace en la página', () => {
  for (const seccion of SECCIONES.filter((s) => s.sepomex)) {
    assert.ok(
      DINAMO.onclicks.includes(`sepomex('${seccion.sepomex.tipo}')`),
      `no hay enlace sepomex('${seccion.sepomex.tipo}')`,
    );
  }
});

test('el RFC del cliente se escribe y se sale del campo, antes que el nombre', () => {
  const cliente = SECCIONES.find((seccion) => seccion.id === 'cliente');
  const ids = cliente.campos.map((campo) => campo.id);
  const rfc = cliente.campos.find((campo) => campo.id === 'txtrfc');

  assert.equal(rfc.de, 'datos.cliente.rfc');
  assert.equal(rfc.blur, true);
  assert.ok(ids.indexOf('txtrfc') < ids.indexOf('txtnombre'));
});

test('el modelo se busca por nombre comercial y el plan solo si se ve', () => {
  const moto = SECCIONES.find((seccion) => seccion.id === 'motocicleta');
  const porId = Object.fromEntries(moto.campos.map((campo) => [campo.id, campo]));

  assert.equal(porId.cbomodelos.tipo, 'selectModelo');
  assert.equal(porId.select3.soloSiVisible, true);
  assert.equal(porId.cboagencia_pto.unicaSiVacio, true);
});

test('las referencias 2 y 3 solo se llenan si el expediente las trae', () => {
  const porId = Object.fromEntries(SECCIONES.map((seccion) => [seccion.id, seccion]));

  assert.equal(porId.referencia.requiere, null);
  assert.equal(porId.referencia2.requiere, 'datos.referencias.ref_b');
  assert.equal(porId.referencia3.requiere, 'datos.referencias.ref_c');
});
