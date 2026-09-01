// Los seis documentos del expediente, cada uno con el prompt y el esquema con
// que se le pide a Gemini que lo lea.
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

const FORMULARIO = {
  id: 'formulario',
  etiqueta: 'Formulario contestado',
  obligatorio: true,
  prompt: `Eres un lector del formulario de crédito que el cliente contesta por
WhatsApp. Puede llegarte como captura de pantalla del chat o como texto.

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
  FORMULARIO,
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

export function tipoAceptado(mime) {
  return TIPOS_ACEPTADOS.has(String(mime ?? ''));
}

export function documentoPorId(id) {
  return DOCUMENTOS.find((doc) => doc.id === id) ?? null;
}
