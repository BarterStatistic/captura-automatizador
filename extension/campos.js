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
//   selectModelo <select> de modelos: el nombre de Dinamo trae el código pegado
//                («ALIEN-R NZ175-IT»), así que se compara el nombre comercial
//   selectNumero <select> elegido por el número de su texto (el plazo)
//   anioModelo   año + modelo juntos, como en Dinamo: el modelo se carga según
//                el año, así que si no existe en el año pedido se prueba en los
//                demás, del más reciente al más viejo
//   checkbox     casilla que se marca
//   radio        botón de opción que se elige (dispara su onclick)
//
// Opciones de campo:
//   opcional      sin dato no se avisa
//   blur          tras escribir se sale del campo: ahí corre su validación
//   unicaSiVacio  sin dato, si el catálogo trae una sola opción, se elige
//   soloSiVisible solo se llena si la página lo está mostrando
//
// Cotejado contra el HTML real de dsc_captura_2022.php (2026-10-02).

/** El accesorio que se cobra como servicio incluido. */
const ACCESORIO_SERVICIO = {
  // El código de producto es estable; el índice de la fila (canAcce_N) no lo es:
  // depende del modelo y de la agencia. Buscar por índice cobraría otra cosa.
  codigo: '590144001',
  descripcion: 'SERVICIO PREVENTIVO 1',
};

/**
 * El plan de pago (`select3`) que corresponde a cada esquema. Dinamo solo
 * muestra ese selector en algunos casos; si no está a la vista, no se toca.
 */
const PLAN_POR_ESQUEMA = {
  1: 'CREDINAMO',
  53: 'CREDINAMO FLEX',
  19: 'DINAMO NOMINA',
  2: 'MOTONOMINA',
  52: 'MOTONOMINA FLEX',
  15: 'MOTOXPRESS',
  51: 'MOTOXPRESS FLEX',
};

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
    // La colonia la elige el vendedor en SEPOMEX; la corrida espera a que el
    // CP (readonly) se llene antes de validar.
    // junto con la calle.
    colonia: { cp: `txtcp_${sufijo}`, que: `de la referencia ${numero}` },
    validar: indice === 0 ? 'valida_referencia' : `valida_referencia_${sufijo.slice(-1)}`,
  };
}

const SECCIONES = [
  {
    id: 'tipoVenta',
    etiqueta: 'Tipo de venta',
    campos: [
      { id: 'cmbTp', tipo: 'select', de: 'manual.tipoVenta', etiqueta: 'Tipo de venta' },
      { id: 'cmbUni', tipo: 'select', de: 'manual.tipoUnidad', etiqueta: 'Tipo de unidad' },
      {
        id: 'cmbEsquemaVenta',
        tipo: 'select',
        de: 'manual.esquemaVenta',
        etiqueta: 'Esquema de venta',
      },
      {
        id: 'cmbSubesquemaVenta',
        tipo: 'select',
        de: 'manual.subesquema',
        etiqueta: 'Subesquema',
      },
    ],
    // `nextStep()` es lo que hace avanzar; no es una validación, pero cumple el
    // mismo papel: revela la sección siguiente.
    validar: 'nextStep',
  },

  {
    id: 'motocicleta',
    etiqueta: 'Motocicleta',
    campos: [
      // Estos catálogos llegan por AJAX y sus value son claves internas
      // (cbomodelos trae cosas como "173_438;...;879"), así que se eligen por
      // el texto que ve una persona.
      {
        id: 'cboagencia_pto',
        tipo: 'selectTexto',
        de: 'manual.ubicacion',
        etiqueta: 'Ubicación',
        dinamico: true,
        // Cada usuario ve solo las ubicaciones de su agencia; con una, es esa.
        unicaSiVacio: true,
      },
      // Año → modelos de ese año (selecciona_anio) → colores del modelo
      // (colores()). Se resuelve en un solo paso para poder cambiar de año si
      // la moto no existe en el pedido.
      {
        id: 'cbomodelos',
        tipo: 'anioModelo',
        anio: 'cboanios',
        colores: 'cbocolores',
        de: 'manual.modelo',
        deAnio: 'manual.anio',
        etiqueta: 'Modelo',
      },
      {
        id: 'cbocolores',
        tipo: 'selectTexto',
        de: 'manual.color',
        etiqueta: 'Color',
        dinamico: true,
        unicaSiVacio: true,
      },
      {
        id: 'select3',
        tipo: 'selectTexto',
        de: 'derivado.planDePago',
        etiqueta: 'Plan de pago',
        soloSiVisible: true,
        opcional: true,
      },
      // Quincenas, o semanas en los esquemas Flex. Se elige por el número que
      // muestra la opción, porque las claves internas de los plazos semanales
      // no se conocen. Puede llegar por AJAX al elegir el modelo.
      {
        id: 'cboplazo',
        tipo: 'selectNumero',
        de: 'manual.plazo',
        etiqueta: 'Plazo',
        dinamico: true,
      },
    ],
    accesorio: ACCESORIO_SERVICIO,
    validar: null,
  },

  {
    id: 'cliente',
    etiqueta: 'Datos del cliente',
    // El orden lo impone Dinamo:
    //   1. Buscar el RFC en «Buscar cliente»: es lo que habilita la sección.
    //   2. Escribirlo en el campo RFC (`inicio`).
    //   3. Datos Fiscales.
    //   4. Lo demás (`campos`).
    buscarCliente: { id: 'txt_buscar_cliente', de: 'datos.cliente.rfc', boton: 'buscar_cliente' },
    inicio: [
      // Con 13 caracteres no salen las preguntas de homoclave (esas solo
      // aparecen con 10). Al salir del campo Dinamo marca persona física,
      // calcula la fecha de nacimiento (cbodia/cbomes/cboanio, deshabilitados),
      // valida la edad mínima de 20 y copia el RFC a «RFC a facturar».
      { id: 'txtrfc', tipo: 'texto', de: 'datos.cliente.rfc', etiqueta: 'RFC', blur: true },
    ],
    // El botón «Datos Fiscales» (id ButtonDF, onclick showFiscal()).
    datosFiscales: { id: 'ButtonDF', boton: 'showFiscal' },
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
    // SEPOMEX lo hace el vendedor a mano. La corrida espera a ver el CP.
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
      {
        id: 'cbofrecuencia_pago',
        tipo: 'selectTexto',
        de: 'datos.empleo.frecuenciaPago',
        etiqueta: 'Frecuencia de pago',
      },
      { id: 'txtsueldo', tipo: 'texto', de: 'datos.empleo.sueldo', etiqueta: 'Sueldo mensual' },
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

/** Datos Fiscales vive en su propia ventana; este es su mapeo. */
const CAMPOS_FISCALES = [
  { id: 'radioM', tipo: 'radio', etiqueta: 'Captura manual' },
  { id: 'cboTipoPersona', tipo: 'select', fijo: 'F', etiqueta: 'Tipo de persona' },
  { id: 'txtRFC', tipo: 'texto', de: 'datos.cliente.rfc', etiqueta: 'RFC' },
  { id: 'txtRazonSocial', tipo: 'texto', de: 'datos.cliente.razonSocial', etiqueta: 'Razón social' },
  { id: 'txtIdCIF', tipo: 'texto', de: 'datos.cliente.idCif', etiqueta: 'idCIF', opcional: true },
  { id: 'cboRegimen_1', tipo: 'select', fijo: '605', etiqueta: 'Régimen' },
  { id: 'cboUsoCFDI', tipo: 'select', fijo: 'S01', etiqueta: 'Uso CFDI' },
  { id: 'txtCalle', tipo: 'texto', de: 'datos.domicilio.calle', etiqueta: 'Calle' },
  {
    id: 'txtNumExterior',
    tipo: 'texto',
    de: 'datos.domicilio.numeroExterior',
    etiqueta: 'Número exterior',
  },
  { id: 'txtCodigoPostal', tipo: 'texto', de: 'datos.domicilio.cp', etiqueta: 'Código postal' },
];

const FISCALES = {
  campos: CAMPOS_FISCALES,
  cpPorDefecto: '25000',
  direccionPorDefecto: '25000;0001;030;COA',
  buscarDireccion: 'obtenerDireccionFiscal',
  // NUNCA por id: `btnGuardarDatos` es el botón de Cancelar cuando el cliente ya
  // tenía datos fiscales. El que guarda es el que llama a validarDatosAEnviar.
  guardar: 'validarDatosAEnviar',
};

Object.assign(globalThis, {
  SECCIONES,
  PLAN_POR_ESQUEMA,
  REFERENCIAS,
  FISCALES,
  ACCESORIO_SERVICIO,
  seccionReferencia,
  valorEn,
});
