// Fusión de las seis lecturas y la captura manual en un solo expediente.
//
// Es el único lugar donde viven las reglas de qué documento gana sobre cuál.
// No habla con Gemini ni con la extensión: recibe objetos ya extraídos y
// devuelve `{ datos, faltantes, avisos }`. Por eso se puede probar sin red.

import { partirTelefono, partirAntiguedad, razonSocial, partirCalle } from './normaliza.js';
import { resolverRfc } from './rfc.js';
import { ESQUEMAS_VENTA, esquemaPorValue, pideIngresos, referenciasRequeridas } from './esquemas.js';
import { opcionPorNombre } from './formulario.js';
import { analizarNomina } from './nomina.js';

// Sin estos, la corrida no arranca: son la identidad del cliente, el domicilio
// y el trabajo. Lo que depende del tipo de crédito (comprobante de ingresos y
// referencias) se agrega en `obligatoriosDe`.
const OBLIGATORIOS = [
  ['curp', (d) => d.cliente.curp],
  ['nombres', (d) => d.cliente.nombres],
  ['apellidoPaterno', (d) => d.cliente.apellidoPaterno],
  ['domicilio.calle', (d) => d.domicilio.calle],
  ['domicilio.numeroExterior', (d) => d.domicilio.numeroExterior],
  ['correo', (d) => d.cliente.correo],
  ['empleo.nombre', (d) => d.empleo.nombre],
  ['celular', (d) => d.cliente.celular],
  // La referencia laboral: el compañero de trabajo del punto 4.
  ['empleo.jefe', (d) => d.empleo.jefe],
  ['empleo.telefono', (d) => d.empleo.telefono],
];

/** Los obligatorios del tipo de crédito elegido (ver esquemas.js). */
function obligatoriosDe(valueEsquema) {
  const lista = [...OBLIGATORIOS];
  if (pideIngresos(valueEsquema)) lista.push(['empleo.sueldo', (d) => d.empleo.sueldo]);
  for (const sufijo of referenciasRequeridas(valueEsquema)) {
    lista.push([`referencias.${sufijo}.nombres`, (d) => d.referencias[sufijo]?.nombres]);
    lista.push([`referencias.${sufijo}.telefono`, (d) => d.referencias[sufijo]?.telefono]);
  }
  return lista;
}

const texto = (valor) => String(valor ?? '').trim();

// «Toda la vida», «desde que nací», «siempre»: no trae cifra, pero sí dice
// cuánto: la edad del cliente.
const TODA_LA_VIDA = /toda\s+(la|su|mi)\s+vida|desde\s+(que\s+)?naci|desde\s+siempre|^\s*siempre\s*$/i;

/** Fecha de nacimiento (AAAA-MM-DD) de la INE; si no, la de la CURP. */
function nacimiento(fechaIne, curp) {
  const ine = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto(fechaIne));
  if (ine) return new Date(Number(ine[1]), Number(ine[2]) - 1, Number(ine[3]));

  const deCurp = /^[A-Z]{4}(\d{2})(\d{2})(\d{2})/.exec(texto(curp).toUpperCase());
  if (!deCurp) return null;
  // El carácter 17 de la CURP es dígito para nacidos antes de 2000, letra después.
  const siglo = /\d/.test(texto(curp).charAt(16)) ? 1900 : 2000;
  return new Date(siglo + Number(deCurp[1]), Number(deCurp[2]) - 1, Number(deCurp[3]));
}

/** Años cumplidos a la fecha `hoy`. */
export function edadEn(fecha, hoy = new Date()) {
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  let anios = hoy.getFullYear() - fecha.getFullYear();
  const aunNo =
    hoy.getMonth() < fecha.getMonth() ||
    (hoy.getMonth() === fecha.getMonth() && hoy.getDate() < fecha.getDate());
  if (aunNo) anios -= 1;
  return anios >= 0 ? anios : null;
}

/** Separa «Luis Perez» en nombre y apellidos, sin inventar el materno. */
function partirNombre(completo) {
  const partes = texto(completo).split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { nombres: '', paterno: '', materno: '' };
  if (partes.length === 1) return { nombres: partes[0], paterno: '', materno: '' };
  if (partes.length === 2) return { nombres: partes[0], paterno: partes[1], materno: '' };
  return {
    nombres: partes.slice(0, -2).join(' '),
    paterno: partes.at(-2),
    materno: partes.at(-1),
  };
}

/** Pesos enteros, o null. Dinamo solo acepta dígitos en txtsueldo. */
function pesos(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  const numero = Number(String(valor).replace(/[^\d.]/g, ''));
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero) : null;
}

const FRECUENCIAS = new Set(['SEMANAL', 'QUINCENAL', 'MENSUAL']);

function frecuenciaDe(valor) {
  const limpia = texto(valor).toUpperCase();
  if (limpia === 'CATORCENAL') return 'QUINCENAL';
  return FRECUENCIAS.has(limpia) ? limpia : '';
}

/**
 * Sueldo, frecuencia y día de pago del comprobante de ingresos, en este orden
 * de preferencia:
 *
 *   1. Lo que el capturista escribió a mano en la revisión (`manual.sueldo`,
 *      `manual.frecuenciaPago`).
 *   2. Recibo de nómina: el monto del recibo TAL CUAL, sin convertirlo a
 *      mensual, y la periodicidad que diga (decisión de Braulio, 2026-10-03).
 *      Estado de cuenta: el cálculo con los depósitos de nómina
 *      (analizarNomina).
 *   3. Lo que Gemini estimó, si no listó depósitos.
 */
function nominaDe(ingresos, manual) {
  const lectura = ingresos ?? {};
  const esRecibo = texto(lectura.tipo_comprobante).toUpperCase() === 'RECIBO_NOMINA';
  const analisis = esRecibo
    ? null
    : analizarNomina(Array.isArray(lectura.depositos_nomina) ? lectura.depositos_nomina : []);

  const aMano = pesos(manual.sueldo);
  const frecuenciaAMano = frecuenciaDe(manual.frecuenciaPago);
  const leida = frecuenciaDe(lectura.frecuencia_pago);
  const frecuencia = frecuenciaAMano || analisis?.frecuencia || leida;

  const delDocumento = esRecibo
    ? pesos(lectura.monto_recibo) ?? pesos(lectura.sueldo_mensual)
    : analisis?.sueldoMensual ?? pesos(lectura.sueldo_mensual);

  return {
    sueldo: aMano ?? delDocumento ?? '',
    frecuencia,
    // El día de pago solo se deduce de los depósitos semanales, y solo si
    // nadie cambió la frecuencia.
    diaPago:
      frecuencia === 'SEMANAL' && (!frecuenciaAMano || frecuenciaAMano === analisis?.frecuencia)
        ? analisis?.diaPago ?? ''
        : '',
    analisis,
    // Cómo se llegó al sueldo, para explicarlo en la revisión.
    origen: aMano ? 'manual' : esRecibo ? 'recibo' : analisis ? 'depositos' : delDocumento ? 'estimado' : '',
    montoRecibo: esRecibo ? pesos(lectura.monto_recibo) : null,
  };
}

export function armarExpediente(lecturas, manual = {}) {
  const { ineFrente = {}, ineAtras = {}, comprobante = {}, formulario = {} } = lecturas ?? {};

  const avisos = [];

  // Un solo comprobante de ingresos, y solo en los tipos que lo piden: en
  // MOTOXPRESS se ignora aunque haya quedado uno leído de antes. `estadosCuenta`
  // y `estadoCuenta1` son los nombres de antes, para expedientes copiados.
  const nomina = nominaDe(
    pideIngresos(manual.esquemaVenta)
      ? lecturas?.ingresos ?? lecturas?.estadosCuenta ?? lecturas?.estadoCuenta1
      : null,
    manual,
  );

  // --- Identidad -------------------------------------------------------------
  // La CURP del frente es la principal; la del reverso solo la corrobora.
  const curp = texto(ineFrente.curp) || texto(ineAtras.curp);
  const curpReverso = texto(ineAtras.curp);
  if (curp && curpReverso && curp !== curpReverso) {
    avisos.push({
      campo: 'curp',
      mensaje:
        `La CURP del frente (${curp}) no coincide con la del reverso (${curpReverso}). ` +
        'Revisa cuál de las dos fotos se leyó mal.',
    });
  }

  const nombres = texto(ineFrente.nombres);
  const paterno = texto(ineFrente.apellido_paterno);
  const materno = texto(ineFrente.apellido_materno);

  let rfc = '';
  if (curp && nombres && paterno) {
    const resuelto = resolverRfc(nombres, paterno, materno, ineFrente.fecha_nacimiento, curp);
    rfc = resuelto.rfc;
    if (resuelto.advertencia) avisos.push({ campo: 'rfc', mensaje: resuelto.advertencia });
  }

  const [usuarioCorreo, dominioCorreo] = texto(formulario.correo).split('@');
  const celular = partirTelefono(manual.celular);

  const cliente = {
    nombres,
    apellidoPaterno: paterno,
    apellidoMaterno: materno,
    curp,
    fechaNacimiento: texto(ineFrente.fecha_nacimiento),
    sexo: texto(ineFrente.sexo),
    rfc,
    razonSocial: razonSocial(nombres, paterno, materno),
    // El OCR de 13 dígitos del reverso alimenta txtife y txtIdCIF. Es opcional:
    // si el reverso salió borroso, se captura a mano y no detiene la corrida.
    idCif: texto(ineAtras.ocr),
    // Número de seguro social (punto 7, opcional). Dinamo no tiene dónde
    // capturarlo: se muestra en la revisión y viaja en el expediente copiado.
    nss: texto(formulario.nss).replace(/\D/g, ''),
    correo: texto(usuarioCorreo),
    dominioCorreo: texto(dominioCorreo) || 'gmail.com',
    celular: celular ? `${celular.lada}${celular.telefono}` : '',
    lada: celular?.lada ?? '',
    telefono: celular?.telefono ?? '',
  };

  // --- Domicilio -------------------------------------------------------------
  // Siempre el del comprobante. El de la INE no se usa nunca, y que el recibo
  // esté a nombre de otra persona es lo normal: no se compara ni se avisa.
  //
  // Calle, número exterior e interior van en campos distintos de Dinamo. Se
  // parten de la línea del recibo, pero si el capturista corrigió alguno en la
  // revisión (`calle_nombre`, `numero_exterior`, `numero_interior`), manda lo
  // corregido, aunque lo haya dejado vacío a propósito.
  const partida = partirCalle(comprobante.calle);
  const corregido = (campo, deLaLinea) =>
    comprobante[campo] === undefined || comprobante[campo] === null
      ? deLaLinea
      : texto(comprobante[campo]);
  const calleDomicilio = corregido('calle_nombre', partida.calle);
  let antiguedadDomicilio = partirAntiguedad(formulario.antiguedad_domicilio);
  if (!antiguedadDomicilio && TODA_LA_VIDA.test(texto(formulario.antiguedad_domicilio))) {
    const edad = edadEn(nacimiento(ineFrente.fecha_nacimiento, curp), manual.hoy ?? new Date());
    if (edad !== null) {
      // txtant_anios admite dos dígitos.
      antiguedadDomicilio = { anios: Math.min(edad, 99), meses: 0 };
      avisos.push({
        campo: 'antiguedadDomicilio',
        mensaje: `Vive ahí «${texto(formulario.antiguedad_domicilio)}»: se capturan ${Math.min(edad, 99)} años, su edad.`,
      });
    } else {
      avisos.push({
        campo: 'antiguedadDomicilio',
        mensaje:
          `Vive ahí «${texto(formulario.antiguedad_domicilio)}», pero no hay fecha de nacimiento ` +
          'para calcular los años. Escríbelos a mano.',
      });
    }
  }
  const domicilio = {
    calle: calleDomicilio,
    numeroExterior: corregido('numero_exterior', partida.numeroExterior),
    numeroInterior: corregido('numero_interior', partida.numeroInterior),
    entreCalles: calleDomicilio,
    colonia: texto(comprobante.colonia),
    cp: texto(comprobante.cp),
    municipio: texto(comprobante.municipio),
    antiguedadAnios: antiguedadDomicilio?.anios ?? 0,
    antiguedadMeses: antiguedadDomicilio?.meses ?? 0,
  };

  // --- Empleo ----------------------------------------------------------------
  const antiguedadEmpleo = partirAntiguedad(formulario.antiguedad_laboral) ?? {
    anios: 0,
    meses: 0,
  };
  const calleEmpleo = partirCalle(formulario.direccion_empleo);
  const telefonoCompanero = partirTelefono(formulario.companero_telefono);

  const empleo = {
    nombre: texto(formulario.empleo),
    antiguedadAnios: antiguedadEmpleo.anios,
    antiguedadMeses: antiguedadEmpleo.meses,
    calle: calleEmpleo.calle,
    numeroExterior: calleEmpleo.numeroExterior,
    numeroInterior: calleEmpleo.numeroInterior,
    colonia: texto(formulario.colonia_empleo),
    jefe: texto(formulario.companero_nombre),
    lada: telefonoCompanero?.lada ?? '',
    telefono: telefonoCompanero?.telefono ?? '',
    sueldo: nomina.sueldo,
    frecuenciaPago: nomina.frecuencia,
    diaPago: nomina.diaPago,
    // Cómo se llegó al sueldo, para mostrarlo en la revisión.
    nomina: nomina.analisis,
    origenSueldo: nomina.origen,
    montoRecibo: nomina.montoRecibo,
  };

  // --- Referencias -----------------------------------------------------------
  const nombreRef = partirNombre(formulario.referencia_nombre);
  const telefonoRef = partirTelefono(formulario.referencia_telefono);
  const referencias = {};

  for (const sufijo of referenciasRequeridas(manual.esquemaVenta)) {
    const capturada = manual.referencias?.[sufijo] ?? {};
    const base = sufijo === 'ref' ? nombreRef : partirNombre(capturada.nombreCompleto);
    const tel = sufijo === 'ref' ? telefonoRef : partirTelefono(capturada.telefono);

    referencias[sufijo] = {
      nombres: base.nombres,
      apellidoPaterno: base.paterno,
      apellidoMaterno: base.materno,
      calle: texto(capturada.calle),
      numeroExterior: texto(capturada.numeroExterior),
      lada: tel?.lada ?? '',
      telefono: tel?.telefono ?? '',
      // El domicilio de la referencia se genera; queda marcado para que quien
      // revisa sepa que ese dato no salió de ningún documento.
      domicilioFicticio: true,
    };
  }

  const datos = { cliente, domicilio, empleo, referencias };

  const faltantes = obligatoriosDe(manual.esquemaVenta)
    .filter(([, leer]) => !texto(leer(datos)))
    .map(([nombre]) => nombre);

  // El tipo de crédito se elige al empezar la captura, no sale de ningún
  // documento. Sin él no se sabe cuántas referencias llenar.
  const elegido = esquemaPorValue(manual.esquemaVenta);
  if (!elegido) faltantes.unshift('tipoCredito');

  // Si el vendedor escribió otro tipo en el formulario, gana lo elegido, pero
  // se avisa: suele ser un error de dedo de uno de los dos.
  const delFormulario = opcionPorNombre(ESQUEMAS_VENTA, formulario.esquema);
  if (elegido && delFormulario && delFormulario.value !== elegido.value) {
    avisos.push({
      campo: 'tipoCredito',
      mensaje:
        `El formulario del vendedor dice ${delFormulario.nombre}, pero se eligió ` +
        `${elegido.nombre}. Se capturará ${elegido.nombre}; cámbialo arriba si no es el bueno.`,
    });
  }

  return { datos, faltantes, avisos };
}
