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

const { SECCIONES, valorEn } = contexto;

const todosLosCampos = () =>
  SECCIONES.flatMap((seccion) => [...(seccion.inicio ?? []), ...seccion.campos]);

// `vm` crea otro realm, así que sus arrays no comparten prototipo con los de
// aquí y deepEqual estricto los rechaza aunque el contenido sea idéntico.
// Copiarlos al realm de la prueba es lo que compara el contenido de verdad.
const local = (iterable) => Array.from(iterable);

test('las secciones van en el orden en que el formulario las habilita', () => {
  assert.deepEqual(
    local(SECCIONES.map((seccion) => seccion.id)),
    [
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

// --- Los campos que no se pueden teclear -------------------------------------

test('los campos readonly de SEPOMEX no se intentan escribir', () => {
  const ids = todosLosCampos().map((campo) => campo.id);

  for (const readonly of ['txtcolonia', 'txtcp', 'txtmpio', 'txtciudad', 'facturaRFCSDF']) {
    assert.ok(!ids.includes(readonly), `${readonly} es readonly: no se escribe`);
  }
});

test('SEPOMEX no se abre: cada sección con colonia sabe qué CP revisar para el resumen', () => {
  const conColonia = Object.fromEntries(
    SECCIONES.filter((seccion) => seccion.colonia).map((seccion) => [seccion.id, seccion.colonia.cp]),
  );

  assert.deepEqual(local(Object.keys(conColonia)), [
    'domicilio',
    'empleo',
    'referencia',
    'referencia2',
    'referencia3',
  ]);
  assert.equal(conColonia.domicilio, 'txtcp');
  assert.equal(conColonia.empleo, 'txtcp_emp');
  assert.equal(conColonia.referencia2, 'txtcp_ref_b');
  assert.ok(SECCIONES.every((seccion) => !('sepomex' in seccion)));
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

// --- Contra el HTML real -------------------------------------------------------
// `ids-dinamo.json` es la lista de controles de dsc_captura_2022.php, sacada del
// HTML que guardó Braulio el 2026-10-02 (sin valores de clientes). Si Dinamo
// renombra un campo, esto falla antes de que la extensión escriba en el vacío.

const DINAMO = JSON.parse(
  readFileSync(fileURLToPath(new URL('./ids-dinamo.json', import.meta.url)), 'utf8'),
);

test('cada campo que llena la extensión existe en el HTML real de Dinamo', () => {
  const faltan = todosLosCampos()
    .flatMap((campo) => [campo.id, campo.anio, campo.colores])
    .concat(SECCIONES.map((seccion) => seccion.buscarCliente?.id))
    .filter(Boolean)
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
    .filter(Boolean);

  for (const funcion of funciones) {
    assert.ok(
      DINAMO.onclicks.some((onclick) => onclick.includes(`${funcion}(`)),
      `no hay botón con ${funcion}()`,
    );
  }
});

test('el CP que se espera es el campo readonly que llena SEPOMEX', () => {
  for (const seccion of SECCIONES.filter((s) => s.colonia)) {
    assert.equal(DINAMO.controles[seccion.colonia.cp]?.readonly, true, seccion.colonia.cp);
  }
});

test('en el cliente: buscar el RFC, escribirlo y luego lo demás, sin Datos Fiscales', () => {
  const cliente = SECCIONES.find((seccion) => seccion.id === 'cliente');
  const [rfc] = cliente.inicio;

  assert.equal(cliente.inicio.length, 1);
  assert.equal(rfc.id, 'txtrfc');
  assert.equal(rfc.de, 'datos.cliente.rfc');
  assert.equal(rfc.blur, true);
  assert.ok(!('datosFiscales' in cliente), 'Datos Fiscales lo hace el vendedor si hace falta');
  assert.ok(!cliente.campos.some((campo) => campo.id === 'txtrfc'));
  assert.equal(cliente.buscarCliente.id, 'txt_buscar_cliente');
  assert.equal(cliente.buscarCliente.de, 'datos.cliente.rfc');
  assert.ok(DINAMO.onclicks.some((onclick) => onclick.includes('buscar_cliente(')));
  assert.equal(DINAMO.controles.txt_buscar_cliente?.tag, 'input');
});

test('las referencias 2 y 3 solo se llenan si el expediente las trae', () => {
  const porId = Object.fromEntries(SECCIONES.map((seccion) => [seccion.id, seccion]));

  assert.equal(porId.referencia.requiere, null);
  assert.equal(porId.referencia2.requiere, 'datos.referencias.ref_b');
  assert.equal(porId.referencia3.requiere, 'datos.referencias.ref_c');
});

test('la moto es del vendedor: la extensión empieza en el cliente', () => {
  const ids = todosLosCampos().map((campo) => campo.id);

  assert.equal(SECCIONES[0].id, 'cliente');
  for (const deLaMoto of ['cmbTp', 'cmbEsquemaVenta', 'cboagencia_pto', 'cboanios', 'cbomodelos', 'cbocolores', 'cboplazo', 'select3']) {
    assert.ok(!ids.includes(deLaMoto), `${deLaMoto} lo captura el vendedor`);
  }
  assert.ok(!ids.some((id) => id.startsWith('canAcce_')), 'el servicio lo marca el vendedor');
});

test('frecuencia, día de pago y sueldo salen de la nómina; el sueldo va entero', () => {
  const porId = Object.fromEntries(todosLosCampos().map((campo) => [campo.id, campo]));

  assert.equal(porId.cbofrecuencia_pago.de, 'datos.empleo.frecuenciaPago');
  assert.equal(porId.diaPago.de, 'datos.empleo.diaPago');
  assert.equal(porId.diaPago.tipo, 'select');
  assert.equal(porId.diaPago.opcional, true, 'solo se deduce en pago semanal');
  assert.equal(porId.txtsueldo.de, 'datos.empleo.sueldo');
  assert.equal(porId.txtsueldo.entero, true);
});

test('las validaciones con colonia no se presionan: van al resumen', () => {
  const motor = readFileSync(fileURLToPath(new URL('../contenido-captura.js', import.meta.url)), 'utf8');

  assert.doesNotMatch(motor, /esperarColoniaManual|pasarPorDatosFiscales|PreguntaDeDinamo/);
  assert.match(motor, /if \(seccion\.colonia\) \{\s*pendienteDeSeccion/);
  assert.match(motor, /'resumen'/);
});

test('la casilla de las referencias 2 y 3 solo se marca si no lo está', () => {
  const motor = readFileSync(fileURLToPath(new URL('../contenido-captura.js', import.meta.url)), 'utf8');

  assert.match(motor, /if \(casilla && !casilla\.checked\) marcar\(casilla\)/);
});
