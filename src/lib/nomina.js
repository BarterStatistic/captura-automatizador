// Sueldo, frecuencia y día de pago a partir de los depósitos de nómina.
//
// Gemini lee los estados de cuenta y lista los depósitos que son sueldo (fecha,
// monto, concepto). La cuenta se hace aquí y no en el modelo: contar días entre
// fechas y sacar una mediana es aritmética, y así sale igual siempre y se puede
// probar.

const DIA_MS = 24 * 60 * 60 * 1000;

// Cuántos pagos de cada frecuencia caben en un mes. Semanal por 4, igual que en
// el prompt original de los estados de cuenta.
const PAGOS_POR_MES = { SEMANAL: 4, QUINCENAL: 2, MENSUAL: 1 };

// Como los escribe el <select id="diaPago"> de Dinamo.
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

function fechaDe(texto) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(texto ?? '').trim());
  if (!partes) return null;
  const fecha = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function montoDe(valor) {
  const numero = Number(String(valor ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function mediana(numeros) {
  const orden = [...numeros].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2;
}

/** SEMANAL, QUINCENAL o MENSUAL según los días típicos entre un pago y otro. */
export function frecuenciaPorDias(dias) {
  if (dias <= 10) return 'SEMANAL';
  if (dias <= 20) return 'QUINCENAL';
  return 'MENSUAL';
}

/**
 * Analiza los depósitos de nómina de uno o varios estados de cuenta.
 *
 * Devuelve `{ frecuencia, sueldoMensual, diaPago, depositos, montoTipico }`, o
 * null si no hay al menos dos depósitos con fecha y monto (con uno solo no se
 * sabe cada cuánto le pagan).
 *
 * - La frecuencia sale de la mediana de días entre depósitos, para que un pago
 *   adelantado o un día festivo no la cambien.
 * - El sueldo mensual es el monto típico (mediana, para que un aguinaldo o un
 *   bono no lo inflen) por los pagos que caben en un mes.
 * - El día de pago solo tiene sentido en pago semanal: el día de la semana que
 *   más se repite. En quincenal y mensual se paga por fecha, no por día.
 */
export function analizarNomina(depositos) {
  const vistos = new Set();
  const validos = (Array.isArray(depositos) ? depositos : [])
    .map((deposito) => ({ fecha: fechaDe(deposito?.fecha), monto: montoDe(deposito?.monto) }))
    .filter(({ fecha, monto }) => fecha && monto)
    // El mismo depósito puede venir en los dos estados de cuenta si se traslapan.
    .filter(({ fecha, monto }) => {
      const clave = `${fecha.getTime()}|${monto}`;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    })
    .sort((a, b) => a.fecha - b.fecha);

  if (validos.length < 2) return null;

  const intervalos = [];
  for (let i = 1; i < validos.length; i += 1) {
    const dias = Math.round((validos[i].fecha - validos[i - 1].fecha) / DIA_MS);
    // Dos depósitos el mismo día (sueldo + vales) no dicen nada de la frecuencia.
    if (dias > 0) intervalos.push(dias);
  }
  if (intervalos.length === 0) return null;

  const frecuencia = frecuenciaPorDias(mediana(intervalos));
  const montoTipico = mediana(validos.map(({ monto }) => monto));

  let diaPago = '';
  if (frecuencia === 'SEMANAL') {
    const cuenta = {};
    for (const { fecha } of validos) cuenta[fecha.getDay()] = (cuenta[fecha.getDay()] ?? 0) + 1;
    const [masComun] = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
    diaPago = DIAS[Number(masComun[0])];
  }

  return {
    frecuencia,
    sueldoMensual: Math.round(montoTipico * PAGOS_POR_MES[frecuencia]),
    diaPago,
    depositos: validos.length,
    montoTipico: Math.round(montoTipico),
  };
}
