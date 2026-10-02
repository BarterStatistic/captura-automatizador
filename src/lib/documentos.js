// Los documentos del expediente, cada uno con el prompt y el esquema con que se
// le pide a Gemini que lo lea, más el clasificador que decide a qué casilla va
// cada archivo que se suelta.
//
// Los prompts se escribieron contra un expediente real (2026-08-31) y llevan
// dentro las trampas que ese expediente reveló: el comprobante a nombre de otra
// persona, el RFC genérico de los recibos, y la dirección de trabajo que llega
// sin número.

const NO_INVENTES =
  'Transcribe EXACTAMENTE lo que ves. No corrijas, no completes y no inventes. ' +
  'Si un dato no se alcanza a leer con certeza, devuélvelo como null.';

const INE_FRENTE = {
  id: 'ineFrente',
  etiqueta: 'INE frente',
  obligatorio: true,
  prompt: `Eres un lector de credenciales para votar del INE mexicano.

Extrae los datos del ANVERSO de la credencial. Reglas:

- ${NO_INVENTES}
- El campo NOMBRE viene en tres renglones: primero el apellido paterno, luego
  el materno y al final los nombres de pila. Sepáralos así.
- El DOMICILIO viene en varios renglones. Devuelve el primero completo y tal
  como está impreso en "calle", incluyendo el número: por ejemplo
  "C JUAREZ 300 2". No lo separes tú.
- La CURP tiene exactamente 18 caracteres. Si no puedes leer los 18, null.
- La fecha de nacimiento en formato AAAA-MM-DD.`,
  esquema: {
    type: 'object',
    properties: {
      nombres: { type: 'string', nullable: true },
      apellido_paterno: { type: 'string', nullable: true },
      apellido_materno: { type: 'string', nullable: true },
      curp: { type: 'string', nullable: true },
      fecha_nacimiento: { type: 'string', nullable: true },
      sexo: { type: 'string', nullable: true },
      calle: { type: 'string', nullable: true },
      colonia: { type: 'string', nullable: true },
      cp: { type: 'string', nullable: true },
      municipio: { type: 'string', nullable: true },
      estado: { type: 'string', nullable: true },
    },
    required: ['nombres', 'apellido_paterno', 'curp'],
  },
};

const INE_ATRAS = {
  id: 'ineAtras',
  etiqueta: 'INE atrás',
  obligatorio: true,
  prompt: `Eres un lector del REVERSO de una credencial para votar del INE mexicano.

Extrae dos cosas de la banda MRZ (las tres líneas de caracteres en mayúsculas
con símbolos "<" al final de la credencial). Reglas:

- ${NO_INVENTES}
- La primera línea tiene la forma IDMEX<número><<<número de 13 dígitos>.
  Devuelve en "ocr" ÚNICAMENTE ese número final de 13 dígitos, sin espacios.
  Ejemplo: de "IDMEX1234567890<<1234567890123" el ocr es "1234567890123".
- Si no puedes leer los 13 dígitos completos, devuelve null.
- En "curp" devuelve la CURP si aparece impresa; si no aparece, null.`,
  esquema: {
    type: 'object',
    properties: {
      ocr: { type: 'string', nullable: true },
      curp: { type: 'string', nullable: true },
    },
    required: ['ocr'],
  },
};

const COMPROBANTE = {
  id: 'comprobante',
  etiqueta: 'Comprobante de domicilio',
  obligatorio: true,
  prompt: `Eres un lector de comprobantes de domicilio mexicanos (recibos de agua,
luz, predial o teléfono).

Extrae el DOMICILIO DEL SERVICIO. Reglas:

- ${NO_INVENTES}
- El recibo puede estar a nombre de OTRA PERSONA distinta del cliente (un
  familiar, el dueño de la casa). Eso es normal: extrae el domicilio igual y
  pon el nombre que aparezca en "titular".
- NUNCA devuelvas el RFC XAXX010101000 ni ningún otro RFC como dato del
  cliente. Ese es el RFC genérico del público en general y no identifica a
  nadie. El campo de RFC no existe en este esquema por esa razón.
- En "calle" devuelve la línea de calle y número tal como está impresa,
  por ejemplo "MORELOS 245 FRAC3". No la separes tú.
- El código postal son 5 dígitos.`,
  esquema: {
    type: 'object',
    properties: {
      titular: { type: 'string', nullable: true },
      calle: { type: 'string', nullable: true },
      colonia: { type: 'string', nullable: true },
      cp: { type: 'string', nullable: true },
      municipio: { type: 'string', nullable: true },
      estado: { type: 'string', nullable: true },
    },
    required: ['calle', 'cp'],
  },
};

const PROMPT_ESTADO_CUENTA = `Eres un analista que lee estados de cuenta bancarios mexicanos.

Determina cuánto gana el titular y cada cuándo le pagan. Reglas:

- ${NO_INVENTES}
- Fíjate en los DEPÓSITOS o ABONOS que se repiten con un monto parecido: ese es
  el sueldo. Ignora traspasos entre cuentas propias, devoluciones y depósitos
  aislados que no forman patrón.
- "frecuencia_pago" debe ser exactamente SEMANAL, QUINCENAL o MENSUAL, según
  cada cuánto aparecen esos depósitos. Si no hay patrón claro, null.
- "sueldo_mensual" es el ingreso mensual en pesos, como número sin símbolos ni
  comas. Si le pagan quincenal, suma las dos quincenas del mes; si semanal,
  multiplica el depósito por 4.
- Si no logras identificar un patrón de sueldo, devuelve ambos campos como null.`;

const ESQUEMA_ESTADO_CUENTA = {
  type: 'object',
  properties: {
    sueldo_mensual: { type: 'number', nullable: true },
    frecuencia_pago: { type: 'string', nullable: true },
  },
  required: ['sueldo_mensual', 'frecuencia_pago'],
};

// El formulario ya no es un archivo: el capturista pega el texto que le mandó
// el vendedor (el formulario que contestó el cliente, a veces con datos de la
// venta agregados). Se lee como texto, sin razonamiento, porque es transcribir.
export const FORMULARIO = {
  id: 'formulario',
  etiqueta: 'Formulario del vendedor',
  prompt: `Eres un lector del formulario de crédito de una agencia de motos. Te llega
el TEXTO que reenvía el vendedor: casi siempre es el formulario que el cliente
contestó por WhatsApp, a veces con preguntas numeradas y a veces solo con las
respuestas, y a veces con datos de la venta agregados por el vendedor.

El formulario tiene seis puntos y tú extraes la RESPUESTA de cada uno:

1) Correo electrónico → "correo"
2) Nombre y dirección de su trabajo → "empleo" (solo el nombre del negocio),
   "direccion_empleo" (la calle con su número si lo dice) y "colonia_empleo"
3) Antigüedad laboral → "antiguedad_laboral", tal como lo escribió ("6 meses")
4) Nombre y teléfono de un compañero de trabajo → "companero_nombre" y
   "companero_telefono"
5) Tiempo viviendo en su casa actual → "antiguedad_domicilio", tal como lo
   escribió ("6 años aprox")
6) Nombre y teléfono de un amigo, conocido o familiar → "referencia_nombre" y
   "referencia_telefono"

Si el texto además trae estos datos, extráelos; si no aparecen, null:

- "celular": el celular DEL CLIENTE (no el del compañero ni el de la referencia)
- "nombre_cliente": el nombre del cliente tal como viene
- "modelo", "color" y "anio" de la moto
- "esquema": el esquema de venta tal como lo escribieron (CREDINAMO, MOTOXPRESS,
  MOTOXPRESS FLEX, MOTONOMINA, DINAMO NOMINA, CREDINAMO FLEX…)
- "subesquema": ASALARIADO, HOME OFFICE, ESQUEMA 50, JUBILADOS, etc., si viene
- "plazo": el plazo, solo el número (son quincenas, o semanas en los esquemas
  Flex; devuelve el número tal como lo escribieron)
- "referencias_extra": si el texto trae MÁS referencias personales además de la
  del punto 6, una lista con { nombre, telefono } de cada una

Reglas:

- ${NO_INVENTES}
- Los teléfonos devuélvelos con todos sus dígitos, tal como aparecen.
- En los nombres NO incluyas el parentesco entre paréntesis: de
  "Luis Perez (Hermano)" el nombre es "Luis Perez".
- La dirección de trabajo suele venir incompleta y sin número. Extrae lo que
  haya y deja en null lo que falte; no completes la dirección tú.
- Las antigüedades devuélvelas como texto literal, no las conviertas a números.`,
  esquema: {
    type: 'object',
    properties: {
      correo: { type: 'string', nullable: true },
      empleo: { type: 'string', nullable: true },
      direccion_empleo: { type: 'string', nullable: true },
      colonia_empleo: { type: 'string', nullable: true },
      antiguedad_laboral: { type: 'string', nullable: true },
      companero_nombre: { type: 'string', nullable: true },
      companero_telefono: { type: 'string', nullable: true },
      antiguedad_domicilio: { type: 'string', nullable: true },
      referencia_nombre: { type: 'string', nullable: true },
      referencia_telefono: { type: 'string', nullable: true },
      celular: { type: 'string', nullable: true },
      nombre_cliente: { type: 'string', nullable: true },
      modelo: { type: 'string', nullable: true },
      color: { type: 'string', nullable: true },
      anio: { type: 'string', nullable: true },
      esquema: { type: 'string', nullable: true },
      subesquema: { type: 'string', nullable: true },
      plazo: { type: 'number', nullable: true },
      referencias_extra: {
        type: 'array',
        nullable: true,
        items: {
          type: 'object',
          properties: {
            nombre: { type: 'string', nullable: true },
            telefono: { type: 'string', nullable: true },
          },
        },
      },
    },
    required: ['correo', 'empleo'],
  },
};

export const DOCUMENTOS = [
  INE_FRENTE,
  INE_ATRAS,
  COMPROBANTE,
  {
    id: 'estadoCuenta1',
    etiqueta: 'Estado de cuenta 1',
    obligatorio: true,
    prompt: PROMPT_ESTADO_CUENTA,
    esquema: ESQUEMA_ESTADO_CUENTA,
  },
  {
    id: 'estadoCuenta2',
    etiqueta: 'Estado de cuenta 2',
    obligatorio: false,
    prompt: PROMPT_ESTADO_CUENTA,
    esquema: ESQUEMA_ESTADO_CUENTA,
  },
];

/** Lo que Gemini sabe leer. El PDF es indispensable: así llegan los estados de cuenta. */
export const TIPOS_ACEPTADOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const POR_EXTENSION = {
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Windows a veces entrega las fotos HEIC del iPhone sin tipo. Se lo pone según
 * la extensión del nombre para no rechazar un archivo que Gemini sí lee.
 */
export function normalizarArchivo(archivo) {
  if (archivo.type) return archivo;
  const extension = String(archivo.name ?? '').split('.').pop().toLowerCase();
  const tipo = POR_EXTENSION[extension];
  return tipo ? new File([archivo], archivo.name, { type: tipo }) : archivo;
}

export function tipoAceptado(mime) {
  return TIPOS_ACEPTADOS.has(String(mime ?? ''));
}

export function documentoPorId(id) {
  return DOCUMENTOS.find((doc) => doc.id === id) ?? null;
}

// --- Clasificación ------------------------------------------------------------
//
// El capturista suelta todos los archivos de golpe; Gemini dice qué es cada uno
// y la app lo acomoda. Va sin razonamiento: es una pregunta de un vistazo y el
// razonamiento solo agregaría segundos de espera por archivo.

export const TIPOS_CLASIFICACION = [
  'INE_FRENTE',
  'INE_ATRAS',
  'INE_AMBOS',
  'COMPROBANTE',
  'ESTADO_CUENTA',
  'OTRO',
];

export const CLASIFICADOR = {
  prompt: `Clasifica este documento del expediente de crédito de un cliente mexicano.
Responde en "tipo" exactamente uno de estos valores:

- INE_FRENTE: anverso de la credencial para votar del INE (foto, nombre, CURP,
  domicilio).
- INE_ATRAS: reverso de la credencial del INE (código QR, huella, y la banda de
  tres líneas que empieza con IDMEX).
- INE_AMBOS: una sola imagen o PDF donde aparecen el frente Y el reverso de la INE.
- COMPROBANTE: recibo de luz (CFE), agua, gas, teléfono, internet o predial.
- ESTADO_CUENTA: estado de cuenta bancario o de nómina, con movimientos y saldos.
- OTRO: cualquier otra cosa (selfie, captura de chat, foto de la moto, etc.).`,
  esquema: {
    type: 'object',
    properties: {
      tipo: { type: 'string', format: 'enum', enum: TIPOS_CLASIFICACION },
    },
    required: ['tipo'],
  },
};

const ESTADOS_CUENTA = ['estadoCuenta1', 'estadoCuenta2'];

/**
 * A qué casillas va un archivo según su tipo. `ocupadas` es un Set con las
 * casillas que ya tienen archivo.
 *
 * Devuelve [] cuando no se sabe (OTRO o un tipo raro): ese archivo se queda en
 * la bandeja para que el capturista lo acomode a mano, porque meter una selfie
 * en la casilla de la INE sería peor que no meterla.
 */
export function ranurasPara(tipo, ocupadas = new Set()) {
  switch (tipo) {
    case 'INE_FRENTE':
      return ['ineFrente'];
    case 'INE_ATRAS':
      return ['ineAtras'];
    case 'INE_AMBOS':
      return ['ineFrente', 'ineAtras'];
    case 'COMPROBANTE':
      return ['comprobante'];
    case 'ESTADO_CUENTA':
      // El primero libre; con los dos llenos, el nuevo reemplaza al segundo
      // para no perder nunca el principal.
      return [ESTADOS_CUENTA.find((id) => !ocupadas.has(id)) ?? 'estadoCuenta2'];
    default:
      return [];
  }
}
