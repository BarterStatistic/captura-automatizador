// Lo que va escrito en cada renglón de la solicitud de crédito impresa de
// Dinamo (el formato de papel, tamaño oficio).
//
// Sale del mismo expediente que llena Dinamo, más lo que solo existe en el
// papel: la moto y el dinero (los captura el vendedor en Dinamo, la app no los
// conoce), el promotor, el estado civil y la vivienda.
//
// Regla de Braulio (2026-10-06): lo que no se sabe con certeza se deja VACÍO
// para llenarlo a mano. Nada se deduce ni se rellena «para que no quede en
// blanco»: ni la ciudad, ni el teléfono de la empresa, ni el domicilio de las
// referencias (el de Dinamo es generado), ni el tipo de persona.
//
// Función pura: no sabe de React ni de la impresión, por eso se prueba sola.

const texto = (valor) => String(valor ?? '').trim();
const mayus = (valor) => texto(valor).toUpperCase();

export const ESTADOS_CIVILES = ['SOLTERO(A)', 'CASADO(A)', 'UNIÓN LIBRE', 'DIVORCIADO(A)', 'VIUDO(A)'];

export const VIVIENDAS = [
  { value: 'PROPIA', nombre: 'Propia' },
  { value: 'RENTADA', nombre: 'Rentada' },
  { value: 'HIPOTECA', nombre: 'Hipoteca' },
  { value: 'PAGANDOLA', nombre: 'Pagándola' },
  { value: 'FAMILIAR', nombre: 'Familiar' },
  { value: 'OTRO', nombre: 'Otro' },
];

// Lo que se escribe en la solicitud aparte del expediente. La agencia es
// siempre la misma. El tipo de persona no se marca nunca: lo marca el cliente.
export const IMPRESION_INICIAL = {
  promotor: '',
  agencia: 'SALTILLO',
  motocicleta: '',
  importe: '',
  enganche: '',
  montoFinanciado: '',
  plazo: '',
  estadoCivil: '',
  vivienda: '',
  puesto: '',
};

/** «8441234567» → «844 123 4567». Lo que no tenga 10 dígitos se deja como venga. */
export function telefonoLegible(valor) {
  const digitos = texto(valor).replace(/\D/g, '');
  const nacional = digitos.length === 12 && digitos.startsWith('52') ? digitos.slice(2) : digitos;
  if (nacional.length !== 10) return texto(valor);
  return `${nacional.slice(0, 3)} ${nacional.slice(3, 6)} ${nacional.slice(6)}`;
}

/** «1990-01-15» → «15/01/1990»; vacío si no es una fecha AAAA-MM-DD. */
export function fechaLegible(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto(valor));
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : '';
}

/** Pesos con signo y comas («$45,990»), o vacío si no hay cifra. */
export function pesosLegibles(valor) {
  const numero = numeroDe(valor);
  return numero === null ? '' : `$${numero.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
}

function numeroDe(valor) {
  const limpio = texto(valor).replace(/[^\d.]/g, '');
  if (!limpio) return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

/** «2 AÑOS 6 MESES», «6 MESES», «1 AÑO»; vacío si no hay antigüedad. */
export function antiguedadLegible(anios, meses) {
  const a = Number(anios) || 0;
  const m = Number(meses) || 0;
  return [a > 0 && `${a} ${a === 1 ? 'AÑO' : 'AÑOS'}`, m > 0 && `${m} ${m === 1 ? 'MES' : 'MESES'}`]
    .filter(Boolean)
    .join(' ');
}

/**
 * La INE imprime H (hombre) o M (mujer); el formato pide M (masculino) o F
 * (femenino). La misma letra M significa cosas opuestas en cada uno.
 */
export function sexoDelFormato(sexoIne) {
  const limpio = mayus(sexoIne);
  if (/^(H|HOMBRE|MASCULINO)$/.test(limpio)) return 'M';
  if (/^(M|MUJER|FEMENINO|F)$/.test(limpio)) return 'F';
  return '';
}

/**
 * Todo lo que se escribe en la solicitud, ya con el formato del papel.
 *
 * `expediente.datos` es lo de `armarExpediente`; `lecturas` aporta lo que el
 * expediente no guarda (el estado del comprobante); `impresion` es lo que el
 * capturista agregó para el papel; `hoy` fija la fecha de la solicitud.
 */
export function datosSolicitud({ datos, lecturas = {}, manual = {}, impresion = {}, hoy = new Date() }) {
  const { cliente = {}, domicilio = {}, empleo = {}, referencias = {} } = datos ?? {};
  const extra = { ...IMPRESION_INICIAL, ...impresion };

  // El monto financiado, si no lo escribieron, es el importe menos el enganche.
  const importe = numeroDe(extra.importe);
  const enganche = numeroDe(extra.enganche);
  const financiado =
    texto(extra.montoFinanciado) ||
    (importe !== null && enganche !== null && importe > enganche ? String(importe - enganche) : '');

  // Del comprobante solo sale el municipio; la ciudad no la dice, así que va
  // vacía. El estado, solo si el comprobante lo trae (no se toma de la INE:
  // ese domicilio puede ser otro).
  const municipio = mayus(domicilio.municipio);
  const estado = mayus(lecturas.comprobante?.estado);

  const correo = cliente.correo ? `${texto(cliente.correo)}@${texto(cliente.dominioCorreo) || 'gmail.com'}` : '';

  // El domicilio de las referencias no se escribe: el que va a Dinamo es
  // generado, no lo dio el cliente.
  const listaReferencias = ['ref', 'ref_b', 'ref_c']
    .map((sufijo) => referencias[sufijo])
    .filter(Boolean)
    .map((ref) => ({
      nombre: mayus([ref.nombres, ref.apellidoPaterno, ref.apellidoMaterno].filter(texto).join(' ')),
      domicilio: '',
      telefono: telefonoLegible(`${texto(ref.lada)}${texto(ref.telefono)}`),
    }));

  const dosDigitos = (n) => String(n).padStart(2, '0');

  return {
    fecha: {
      dia: dosDigitos(hoy.getDate()),
      mes: dosDigitos(hoy.getMonth() + 1),
      anio: String(hoy.getFullYear()),
    },
    venta: {
      promotor: mayus(extra.promotor),
      agencia: mayus(extra.agencia),
      motocicleta: mayus(extra.motocicleta),
      importe: pesosLegibles(extra.importe),
      enganche: pesosLegibles(extra.enganche),
      montoFinanciado: pesosLegibles(financiado),
      plazo: mayus(extra.plazo),
    },
    personal: {
      nombres: mayus(cliente.nombres),
      apellidoPaterno: mayus(cliente.apellidoPaterno),
      apellidoMaterno: mayus(cliente.apellidoMaterno),
      fechaNacimiento: fechaLegible(cliente.fechaNacimiento),
      // Con INE vigente el cliente es mexicano.
      nacionalidad: cliente.curp ? 'MEXICANA' : '',
      estadoCivil: mayus(extra.estadoCivil),
      rfc: mayus(cliente.rfc),
      sexo: sexoDelFormato(cliente.sexo),
      correo: correo.toLowerCase(),
    },
    domicilio: {
      calle: mayus(domicilio.calle),
      numeroExterior: mayus(domicilio.numeroExterior),
      numeroInterior: mayus(domicilio.numeroInterior),
      colonia: mayus(domicilio.colonia),
      cp: texto(domicilio.cp),
      ciudad: '',
      municipio,
      estado,
      antiguedad: antiguedadLegible(domicilio.antiguedadAnios, domicilio.antiguedadMeses),
      vivienda: texto(extra.vivienda),
      celular: telefonoLegible(cliente.celular),
    },
    empleo: {
      empresa: mayus(empleo.nombre),
      calle: mayus(empleo.calle),
      numeroExterior: mayus(empleo.numeroExterior),
      numeroInterior: mayus(empleo.numeroInterior),
      colonia: mayus(empleo.colonia),
      antiguedad: antiguedadLegible(empleo.antiguedadAnios, empleo.antiguedadMeses),
      puesto: mayus(extra.puesto),
      // El jefe inmediato es SIEMPRE la referencia laboral (el compañero del
      // punto 4 del formulario), igual que en Dinamo. El teléfono de la
      // empresa no se sabe: va vacío.
      jefe: mayus(empleo.jefe),
      frecuenciaPago: mayus(empleo.frecuenciaPago),
      // Si el sueldo se calculó con depósitos del estado de cuenta, le pagan
      // por banco. Del recibo de nómina no se sabe cómo cobra.
      formaPago: empleo.origenSueldo === 'depositos' ? 'ELECTRONICO' : '',
      // Es el mismo sueldo que se captura en Dinamo: del recibo, tal cual.
      ingreso: pesosLegibles(empleo.sueldo),
    },
    referencias: listaReferencias,
  };
}
