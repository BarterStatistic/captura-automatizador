// El mapeo entre el expediente y los campos de la Captura de Ventas DSC.
//
// Todos los ids salen del HTML real de Dinamo. Los botones NO se localizan por
// XPath sino por la función de su `onclick` (`valida_domicilio`, `valida_empleo`…):
// un XPath absoluto se rompe en cuanto alguien inserta un <tr>, y el nombre de
// la función no.
//
// Se carga como script clásico, antes de `contenido-captura.js`. Por eso lo que
// exporta se cuelga de globalThis al final en vez de usar `export`.
//
// Tipos de campo:
//   texto        input de texto
//   select       <select> elegido por value (catálogo fijo y verificado)
//   selectTexto  <select> elegido por texto visible (catálogo que llega por AJAX,
//                cuyos value son claves internas que nadie puede cotejar a ojo)
//   checkbox     casilla que se marca
//   radio        botón de opción que se elige (dispara su onclick)
//
// Opciones de campo:
//   opcional      sin dato no se avisa
//   blur          tras escribir se sale del campo: ahí corre su validación
//   entero        se escribe como número entero, sin comas ni centavos
//
// Cotejado contra el HTML real de dsc_captura_2022.php (2026-10-02).
//
// El tipo de venta y la moto (modelo, color, plazo, servicio) los captura el
// vendedor a mano. La extensión empieza en «Buscar cliente» y llega hasta las
// referencias.

/** Lee `datos.cliente.curp` de un objeto, sin reventar si falta un tramo. */
function valorEn(objeto, ruta) {
  const valor = String(ruta)
    .split('.')
    .reduce((actual, tramo) => (actual == null ? undefined : actual[tramo]), objeto);
  return valor == null ? '' : String(valor);
}

// Sufijos y variantes de las cuatro secciones de referencia del formulario.
// Solo se usan las tres primeras: la cuarta nunca se pide.
const REFERENCIAS = [
  { sufijo: 'ref', status: 'cmbStatusLabRef1', centro: 'txtCentroLabRef1', activar: null },
  {
    sufijo: 'ref_b',
    status: 'cmbStatusLabRef2',
    centro: 'txtCentroLabRef2',
    activar: 'check_referencia2',
  },
  {
    sufijo: 'ref_c',
    status: 'cmbStatusLabRef3',
    centro: 'txtCentroLabRef3',
    activar: 'check_referencia3',
  },
];

/**
 * Construye la sección de una referencia.
 *
 * Las tres comparten forma pero no ids: la primera es `_ref` con
 * `cmbStatusLabRef1`, la segunda `_ref_b` con `cmbStatusLabRef2`. Generarlas
 * evita tres copias que se desincronizarían en cuanto se toque una.
 */
function seccionReferencia(indice) {
  const { sufijo, status, centro, activar } = REFERENCIAS[indice];
  const numero = indice + 1;
  const base = `datos.referencias.${sufijo}`;

  // `_ref` → '', `_ref_b` → '_b': así nombra Dinamo el segundo «Tipo».
  const variante = sufijo.slice(3);

  return {
    id: indice === 0 ? 'referencia' : `referencia${numero}`,
    etiqueta: `Referencia ${numero}`,
    // Las referencias 2 y 3 viven ocultas hasta que se marca su casilla, y solo
    // se llenan si el expediente las trae (MOTOXPRESS y MOTOXPRESS FLEX).
    activar,
    requiere: indice === 0 ? null : base,
    campos: [
      { id: `cbotipo_${sufijo}`, tipo: 'select', fijo: '1', etiqueta: 'Tipo de referencia' },
      { id: `txtnombre_${sufijo}`, tipo: 'texto', de: `${base}.nombres`, etiqueta: 'Nombre' },
      {
        id: `txtpaterno_${sufijo}`,
        tipo: 'texto',
        de: `${base}.apellidoPaterno`,
        etiqueta: 'Apellido paterno',
      },
      {
        id: `txtmaterno_${sufijo}`,
        tipo: 'texto',
        de: `${base}.apellidoMaterno`,
        etiqueta: 'Apellido materno',
      },
      { id: `cbotipo_ref2${variante}`, tipo: 'select', fijo: '1', etiqueta: 'Personal o comercial' },
      { id: `txtcalle_${sufijo}`, tipo: 'texto', de: `${base}.calle`, etiqueta: 'Calle' },
      {
        id: `txtnum_ext_${sufijo}`,
        tipo: 'texto',
        de: `${base}.numeroExterior`,
        etiqueta: 'Número exterior',
      },
      {
        id: `txtnum_int_${sufijo}`,
        tipo: 'texto',
        de: `${base}.numeroInterior`,
        etiqueta: 'Número interior',
        opcional: true,
      },
      { id: status, tipo: 'select', fijo: '2', etiqueta: 'Estatus laboral' },
      { id: centro, tipo: 'texto', fijo: 'trabajador', etiqueta: 'Centro laboral' },
      { id: `cbohora_de_${sufijo}`, tipo: 'select', fijo: '10', etiqueta: 'Verificación desde' },
      { id: `cbohora_a_${sufijo}`, tipo: 'select', fijo: '12', etiqueta: 'Verificación hasta' },
      { id: `txtlada_${sufijo}`, tipo: 'texto', de: `${base}.lada`, etiqueta: 'Lada' },
      { id: `txttelefono_${sufijo}`, tipo: 'texto', de: `${base}.telefono`, etiqueta: 'Teléfono' },
      { id: `cbotipo_tel_${sufijo}`, tipo: 'select', fijo: '5', etiqueta: 'Tipo de teléfono' },
      { id: `check_${sufijo}_A`, tipo: 'checkbox', fijo: true, etiqueta: 'Verificación' },
    ],
    // La colonia la elige el vendedor en SEPOMEX y, con ella, valida la
    // sección. La corrida no espera: lo anota en el resumen.
    colonia: { cp: `txtcp_${sufijo}`, que: `de la referencia ${numero}` },
    validar: indice === 0 ? 'valida_referencia' : `valida_referencia_${sufijo.slice(-1)}`,
  };
}

const SECCIONES = [
  {
    id: 'cliente',
    etiqueta: 'Datos del cliente',
    // El orden lo impone Dinamo:
    //   1. Buscar el RFC en «Buscar cliente»: es lo que habilita la sección.
    //   2. Escribirlo en el campo RFC (`inicio`).
    //   3. Lo demás (`campos`).
    // Datos Fiscales ya no lo toca la extensión: queda en el resumen.
    buscarCliente: { id: 'txt_buscar_cliente', de: 'datos.cliente.rfc', boton: 'buscar_cliente' },
    inicio: [
      // Con 13 caracteres no salen las preguntas de homoclave (esas solo
      // aparecen con 10). Al salir del campo Dinamo marca persona física,
      // calcula la fecha de nacimiento (cbodia/cbomes/cboanio, deshabilitados),
      // valida la edad mínima de 20 y copia el RFC a «RFC a facturar».
      { id: 'txtrfc', tipo: 'texto', de: 'datos.cliente.rfc', etiqueta: 'RFC', blur: true },
    ],
    campos: [
      { id: 'txtnombre', tipo: 'texto', de: 'datos.cliente.nombres', etiqueta: 'Nombre(s)' },
      {
        id: 'txtpaterno',
        tipo: 'texto',
        de: 'datos.cliente.apellidoPaterno',
        etiqueta: 'Apellido paterno',
      },
      {
        id: 'txtmaterno',
        tipo: 'texto',
        de: 'datos.cliente.apellidoMaterno',
        etiqueta: 'Apellido materno',
      },
      // Se escribe antes que los demás: su onchange dispara extraerDatosCurp(),
      // que rellena sexo y fecha de nacimiento solo.
      { id: 'txtcurp', tipo: 'texto', de: 'datos.cliente.curp', etiqueta: 'CURP' },
      { id: 'txtife', tipo: 'texto', de: 'datos.cliente.idCif', etiqueta: 'idCIF' },
      { id: 'cbomedio', tipo: 'select', fijo: '14', etiqueta: 'Medio de venta' },
      {
        id: 'txt_otro',
        tipo: 'texto',
        de: 'datos.empleo.nombre',
        etiqueta: 'Actividad económica',
      },
      { id: 'cbonacionalidad', tipo: 'select', fijo: '1', etiqueta: 'Nacionalidad' },
      { id: 'txtemail', tipo: 'texto', de: 'datos.cliente.correo', etiqueta: 'Correo', blur: true },
      {
        id: 'cbo_dominio',
        tipo: 'selectTexto',
        de: 'datos.cliente.dominioCorreo',
        etiqueta: 'Dominio del correo',
      },
    ],
    validarEmail: 'on_validar_email',
    validar: 'valida_cliente',
  },

  {
    id: 'domicilio',
    etiqueta: 'Domicilio del cliente',
    campos: [
      { id: 'txtcalle', tipo: 'texto', de: 'datos.domicilio.calle', etiqueta: 'Calle' },
      { id: 'txtentre', tipo: 'texto', de: 'datos.domicilio.entreCalles', etiqueta: 'Entre calles' },
      {
        id: 'txtnum_ext',
        tipo: 'texto',
        de: 'datos.domicilio.numeroExterior',
        etiqueta: 'Número exterior',
      },
      {
        id: 'txtnum_int',
        tipo: 'texto',
        de: 'datos.domicilio.numeroInterior',
        etiqueta: 'Número interior',
        opcional: true,
      },
      { id: 'cbovivienda', tipo: 'select', fijo: '2', etiqueta: 'Tipo de vivienda' },
      {
        id: 'txtant_anios',
        tipo: 'texto',
        de: 'datos.domicilio.antiguedadAnios',
        etiqueta: 'Antigüedad en el domicilio (años)',
      },
      // Los meses de esa antigüedad: en el HTML se llama así, `select2`.
      {
        id: 'select2',
        tipo: 'select',
        de: 'datos.domicilio.antiguedadMeses',
        etiqueta: 'Antigüedad en el domicilio (meses)',
        opcional: true,
      },
      { id: 'cbohora_de', tipo: 'select', fijo: '10', etiqueta: 'Verificación desde' },
      { id: 'cbohora_a', tipo: 'select', fijo: '12', etiqueta: 'Verificación hasta' },
      { id: 'txtlada', tipo: 'texto', de: 'datos.cliente.lada', etiqueta: 'Lada' },
      { id: 'txttelefono', tipo: 'texto', de: 'datos.cliente.telefono', etiqueta: 'Teléfono' },
      { id: 'cbotipo_tel', tipo: 'select', fijo: '5', etiqueta: 'Tipo de línea' },
      { id: 'check_cli_A', tipo: 'checkbox', fijo: true, etiqueta: 'Verificación' },
    ],
    // txtcolonia, txtcp, txtmpio y txtciudad son readonly: los llena SEPOMEX, y
    // SEPOMEX lo hace el vendedor a mano. La pista va al resumen.
    colonia: {
      cp: 'txtcp',
      que: 'del domicilio del cliente',
      pista: { cp: 'datos.domicilio.cp', colonia: 'datos.domicilio.colonia' },
    },
    validar: 'valida_domicilio',
  },

  {
    id: 'empleo',
    etiqueta: 'Empleo',
    campos: [
      { id: 'txtempleo', tipo: 'texto', de: 'datos.empleo.nombre', etiqueta: 'Nombre del empleo' },
      {
        id: 'txtant_anios_emp',
        tipo: 'texto',
        de: 'datos.empleo.antiguedadAnios',
        etiqueta: 'Antigüedad (años)',
      },
      {
        id: 'cboant_meses_emp',
        tipo: 'select',
        de: 'datos.empleo.antiguedadMeses',
        etiqueta: 'Antigüedad (meses)',
      },
      { id: 'cbosector', tipo: 'select', fijo: '2', etiqueta: 'Sector' },
      { id: 'cboactividad', tipo: 'select', fijo: '1', etiqueta: 'Actividad' },
      { id: 'txtpuesto', tipo: 'texto', fijo: 'trabajador', etiqueta: 'Puesto' },
      // El sueldo sale de los estados de cuenta: le pagan por depósito.
      {
        id: 'radiobutton_elec',
        tipo: 'radio',
        fijo: true,
        texto: 'Electrónica',
        etiqueta: 'Forma de percepción',
      },
      // Frecuencia, día y sueldo salen de los depósitos de nómina.
      {
        id: 'cbofrecuencia_pago',
        tipo: 'selectTexto',
        de: 'datos.empleo.frecuenciaPago',
        etiqueta: 'Frecuencia de pago',
      },
      // Su renglón aparece al elegir la frecuencia; solo se deduce en pago semanal.
      { id: 'diaPago', tipo: 'select', de: 'datos.empleo.diaPago', etiqueta: 'Día de pago', opcional: true },
      {
        id: 'txtsueldo',
        tipo: 'texto',
        de: 'datos.empleo.sueldo',
        etiqueta: 'Sueldo mensual',
        entero: true,
      },
      { id: 'txtjefe', tipo: 'texto', de: 'datos.empleo.jefe', etiqueta: 'Jefe o contacto' },
      { id: 'cbooficina', tipo: 'select', fijo: '2', etiqueta: 'Tipo de oficina' },
      { id: 'txtcalle_emp', tipo: 'texto', de: 'datos.empleo.calle', etiqueta: 'Calle del trabajo' },
      {
        id: 'txtnum_ext_emp',
        tipo: 'texto',
        de: 'datos.empleo.numeroExterior',
        etiqueta: 'Número exterior del trabajo',
        opcional: true,
      },
      {
        id: 'txtnum_int_emp',
        tipo: 'texto',
        de: 'datos.empleo.numeroInterior',
        etiqueta: 'Número interior del trabajo',
        opcional: true,
      },
      { id: 'cbohora_de_emp', tipo: 'select', fijo: '16', etiqueta: 'Verificación desde' },
      { id: 'cbohora_a_emp', tipo: 'select', fijo: '18', etiqueta: 'Verificación hasta' },
      { id: 'txtlada_emp', tipo: 'texto', de: 'datos.empleo.lada', etiqueta: 'Lada del trabajo' },
      {
        id: 'txttelefono_emp',
        tipo: 'texto',
        de: 'datos.empleo.telefono',
        etiqueta: 'Teléfono del trabajo',
      },
      { id: 'cbotipo_tel_emp', tipo: 'select', fijo: '5', etiqueta: 'Tipo de teléfono' },
      { id: 'check_emp_A', tipo: 'checkbox', fijo: true, etiqueta: 'Verificación' },
    ],
    colonia: {
      cp: 'txtcp_emp',
      que: 'del trabajo',
      pista: { colonia: 'datos.empleo.colonia' },
    },
    validar: 'valida_empleo',
  },

  seccionReferencia(0),
  seccionReferencia(1),
  seccionReferencia(2),

  {
    id: 'final',
    etiqueta: 'Cierre',
    campos: [{ id: 'txtcomenta', tipo: 'texto', fijo: 'OK', etiqueta: 'Comentario' }],
    // Aquí se acaba. El botón Grabar (`valida()`) lo presiona una persona: una
    // captura de crédito no se deshace.
    validar: null,
    detenerse: true,
  },
];

Object.assign(globalThis, {
  SECCIONES,
  REFERENCIAS,
  seccionReferencia,
  valorEn,
});
