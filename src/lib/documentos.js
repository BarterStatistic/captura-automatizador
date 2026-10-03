// Los documentos del expediente, cada uno con el prompt y el esquema con que se
// le pide a Gemini que lo lea, más el clasificador que decide a qué casilla va
// cada archivo que se suelta.
//
// Los prompts se escribieron contra un expediente real (2026-08-31) y llevan
// dentro las trampas que ese expediente reveló: el comprobante a nombre de otra
// persona, el RFC genérico de los recibos, y la dirección de trabajo que llega
// sin número.

import { pideIngresos } from './esquemas.js';

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

// Un solo comprobante de ingresos: estado de cuenta o recibo de nómina. Los
// dos se leen con el mismo prompt y Gemini dice cuál es, porque el sueldo sale
// distinto de cada uno: del estado de cuenta se calcula con los depósitos; del
// recibo se toma tal cual, sin convertirlo a mensual (decisión de Braulio,
// 2026-10-03).
const PROMPT_INGRESOS = `Eres un analista que lee comprobantes de ingresos mexicanos.

El documento es uno de estos dos:

- ESTADO_CUENTA: un estado de cuenta bancario, con movimientos (depósitos y
  retiros) y saldos.
- RECIBO_NOMINA: un recibo de nómina (CFDI de nómina, talón o comprobante de
  pago que da el patrón), con percepciones, deducciones y neto a pagar.

Pon en "tipo_comprobante" exactamente ESTADO_CUENTA o RECIBO_NOMINA. Reglas:

- ${NO_INVENTES}

Si es ESTADO_CUENTA, busca los INGRESOS DE NÓMINA del titular:
- En "depositos_nomina" lista CADA depósito de sueldo que aparezca, uno por
  uno, con:
    "fecha": la fecha del movimiento en formato AAAA-MM-DD (usa el año del
             periodo del estado de cuenta si la línea no lo trae),
    "monto": el importe depositado, como número sin símbolos ni comas,
    "concepto": la descripción tal como aparece.
- Un depósito es de nómina si su concepto lo dice (NOMINA, PAGO DE NOMINA,
  SUELDO, SALARIO, PAGO QUINCENA, DISPERSION, el nombre de la empresa
  empleadora) o si se repite con monto parecido en intervalos regulares.
- NO son nómina: traspasos entre cuentas propias, depósitos en efectivo
  aislados, devoluciones, reembolsos, intereses, préstamos, pagos de tarjeta,
  ni transferencias de personas que no se repiten.
- "frecuencia_pago" es SEMANAL, QUINCENAL o MENSUAL según cada cuánto llegan
  esos depósitos; null si no hay patrón claro.
- "sueldo_mensual": el ingreso mensual estimado, número sin símbolos; null si
  no hay patrón.
- Deja "monto_recibo" en null.

Si es RECIBO_NOMINA:
- "monto_recibo": el NETO A PAGAR del recibo, número sin símbolos ni comas.
  Si no hay neto, el total de percepciones.
- "frecuencia_pago": la periodicidad del pago que diga el recibo (SEMANAL,
  QUINCENAL o MENSUAL; catorcenal cuenta como QUINCENAL). null si no la dice.
- "fecha_pago": la fecha de pago en formato AAAA-MM-DD, o null.
- "empleador": el nombre del patrón o empresa, o null.
- Deja "depositos_nomina" vacía y "sueldo_mensual" en null: el monto del
  recibo se usa tal cual, no lo conviertas a mensual.`;

const ESQUEMA_INGRESOS = {
  type: 'object',
  properties: {
    tipo_comprobante: {
      type: 'string',
      format: 'enum',
      enum: ['ESTADO_CUENTA', 'RECIBO_NOMINA'],
    },
    depositos_nomina: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fecha: { type: 'string', nullable: true },
          monto: { type: 'number', nullable: true },
          concepto: { type: 'string', nullable: true },
        },
      },
    },
    sueldo_mensual: { type: 'number', nullable: true },
    frecuencia_pago: { type: 'string', nullable: true },
    monto_recibo: { type: 'number', nullable: true },
    fecha_pago: { type: 'string', nullable: true },
    empleador: { type: 'string', nullable: true },
  },
  required: ['tipo_comprobante', 'depositos_nomina', 'frecuencia_pago'],
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

El formulario que mandan los vendedores tiene exactamente este esqueleto, y la
respuesta va después de cada pregunta (en el mismo renglón o en el siguiente):

  Favor de llenar la siguiente información para llenar su solicitud de crédito
  1) Correo electrónico:
  2) Nombre y dirección
  3) Antigüedad laboral
  4) Nombre y teléfono de algún compañero de su trabajo
  5) Tiempo viviendo en su casa actual:
  6) Nombre y teléfono de algún amigo, conocido o familiar
  7) Número de seguro social (Opcional)

Extrae la RESPUESTA de cada punto:

1) → "correo"
2) Es el nombre y la dirección del TRABAJO del cliente (los puntos 3 y 4 son
   del mismo trabajo), no el nombre del cliente → "empleo" (solo el nombre del
   negocio), "direccion_empleo" (la calle con su número si lo dice) y
   "colonia_empleo"
3) → "antiguedad_laboral", tal como lo escribió ("6 meses")
4) → "companero_nombre" y "companero_telefono"
5) → "antiguedad_domicilio", tal como lo escribió ("6 años aprox", "toda la
   vida"); no lo conviertas
6) → "referencia_nombre" y "referencia_telefono"
7) → "nss": el número de seguro social, solo dígitos; si no lo puso, null

Si el texto además trae estos datos, extráelos; si no aparecen, null:

- "celular": el celular DEL CLIENTE (no el del compañero ni el de la referencia)
- "nombre_cliente": el nombre del cliente tal como viene
- "esquema": el esquema de venta tal como lo escribieron (CREDINAMO, MOTOXPRESS,
  MOTOXPRESS FLEX, MOTONOMINA, MOTONOMINA FLEX, CREDINAMO FLEX…)
- "referencias_extra": si el texto trae MÁS referencias personales además de la
  del punto 6, una lista con { nombre, telefono } de cada una

Cuando el texto viene numerado, al final se agrega una sección «RESPUESTAS
SEPARADAS POR PUNTO» con la respuesta de cada punto ya aislada de su pregunta.
Úsala para saber a qué punto pertenece cada respuesta; si choca con el texto
original, manda el texto original.

El texto puede venir con formato de WhatsApp (*negritas*, _cursivas_, emojis
de número como 1️⃣) o con renglones cortados: ignora el formato.

Reglas:

- ${NO_INVENTES}
- Los teléfonos devuélvelos con todos sus dígitos, tal como aparecen.
- El correo devuélvelo en minúsculas y sin espacios.
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
      nss: { type: 'string', nullable: true },
      celular: { type: 'string', nullable: true },
      nombre_cliente: { type: 'string', nullable: true },
      esquema: { type: 'string', nullable: true },
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
    id: 'ingresos',
    etiqueta: 'Comprobante de ingresos',
    sub: 'Estado de cuenta o recibo de nómina',
    // Obligatorio solo en los tipos de crédito que lo piden (pideIngresos).
    obligatorio: true,
    soloSiPideIngresos: true,
    prompt: PROMPT_INGRESOS,
    esquema: ESQUEMA_INGRESOS,
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
  'RECIBO_NOMINA',
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
- RECIBO_NOMINA: recibo de nómina o CFDI de nómina (percepciones, deducciones,
  neto a pagar).
- OTRO: cualquier otra cosa (selfie, captura de chat, foto de la moto, etc.).`,
  esquema: {
    type: 'object',
    properties: {
      tipo: { type: 'string', format: 'enum', enum: TIPOS_CLASIFICACION },
    },
    required: ['tipo'],
  },
};

/**
 * A qué casillas va un archivo según su tipo. Hay una sola casilla de
 * ingresos: un comprobante nuevo reemplaza al anterior.
 *
 * Devuelve [] cuando no se sabe (OTRO o un tipo raro): ese archivo se queda en
 * la bandeja para que el capturista lo acomode a mano, porque meter una selfie
 * en la casilla de la INE sería peor que no meterla.
 */
export function ranurasPara(tipo) {
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
    case 'RECIBO_NOMINA':
      return ['ingresos'];
    default:
      return [];
  }
}

/** ¿El documento es obligatorio para este tipo de crédito? */
export function esObligatorio(documento, valueEsquema) {
  if (!documento?.obligatorio) return false;
  return !documento.soloSiPideIngresos || pideIngresos(valueEsquema);
}
