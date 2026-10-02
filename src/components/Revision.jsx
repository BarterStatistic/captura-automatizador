import { useId, useState } from 'react';

import { referenciasRequeridas } from '../lib/esquemas.js';
import { CIUDADES, generarDomicilio } from '../lib/calles.js';
import { idDeFaltante } from './BarraAccion.jsx';
import { IconoAlerta } from './Iconos.jsx';

// Qué faltantes caen en cada grupo, para contar en su encabezado.
const FALTANTES_POR_GRUPO = {
  cliente: ['nombres', 'apellidoPaterno', 'curp', 'correo', 'celular'],
  domicilio: ['domicilio.calle', 'domicilio.numeroExterior'],
  empleo: ['empleo.nombre'],
};

/**
 * Todo lo que se revisa antes de llenar: lo que leyó Gemini (editable, porque
 * una foto borrosa se corrige aquí y no en Dinamo), lo que solo sabe el
 * capturista, y lo que la app derivó de ambos.
 *
 * La moto no está aquí: el tipo de venta y la moto los captura el vendedor a
 * mano en Dinamo, y la extensión sigue desde los datos del cliente.
 *
 * Editar un campo leído recalcula el expediente completo, así que el RFC y los
 * teléfonos partidos se actualizan solos.
 */
export default function Revision({ lecturas, manual, expediente, onLectura, onManual }) {
  const { datos, faltantes, avisos } = expediente;
  const [soloFaltantes, setSoloFaltantes] = useState(false);
  const falta = (nombre) => faltantes.includes(nombre);
  const cuantas = (grupo) => FALTANTES_POR_GRUPO[grupo].filter(falta).length;
  const referencias = referenciasRequeridas(manual.esquemaVenta);
  return (
    <div className={`revision${soloFaltantes ? ' solo-faltantes' : ''}`}>
      <div className="revision-barra">
        <p className="nota-suave">
          Corrige lo que Gemini haya leído mal. Lo marcado en rojo es obligatorio.
        </p>
        <label className="interruptor">
          <input
            type="checkbox"
            checked={soloFaltantes}
            onChange={(evento) => setSoloFaltantes(evento.target.checked)}
          />
          <span className="interruptor-pista" aria-hidden="true" />
          Solo lo que falta
        </label>
      </div>

      {avisos.map((aviso) => (
        <div className="aviso ambar" key={aviso.campo + aviso.mensaje}>
          <IconoAlerta tamano={16} />
          <span>{aviso.mensaje}</span>
        </div>
      ))}

      {soloFaltantes && faltantes.filter((f) => f !== 'tipoCredito').length === 0 && (
        <p className="revision-vacia">No falta ningún dato obligatorio.</p>
      )}

      <Grupo titulo="Cliente" faltan={cuantas('cliente')}>
        <Campo
          clave="nombres"
          etiqueta="Nombre(s)"
          valor={lecturas.ineFrente?.nombres}
          falta={falta('nombres')}
          onCambio={(v) => onLectura('ineFrente', 'nombres', v)}
        />
        <Campo
          clave="apellidoPaterno"
          etiqueta="Apellido paterno"
          valor={lecturas.ineFrente?.apellido_paterno}
          falta={falta('apellidoPaterno')}
          onCambio={(v) => onLectura('ineFrente', 'apellido_paterno', v)}
        />
        <Campo
          etiqueta="Apellido materno"
          valor={lecturas.ineFrente?.apellido_materno}
          onCambio={(v) => onLectura('ineFrente', 'apellido_materno', v)}
        />
        <Campo
          clave="curp"
          etiqueta="CURP"
          valor={lecturas.ineFrente?.curp}
          falta={falta('curp')}
          mono
          onCambio={(v) => onLectura('ineFrente', 'curp', v)}
        />
        <Campo
          etiqueta="OCR del reverso"
          valor={lecturas.ineAtras?.ocr}
          nota="13 dígitos. Va a IFE e idCIF. Opcional."
          mono
          onCambio={(v) => onLectura('ineAtras', 'ocr', v)}
        />
        <Campo
          clave="correo"
          etiqueta="Correo"
          valor={lecturas.formulario?.correo}
          falta={falta('correo')}
          onCambio={(v) => onLectura('formulario', 'correo', v)}
        />
        <Campo
          clave="celular"
          etiqueta="Celular del cliente"
          valor={manual.celular}
          falta={falta('celular')}
          nota="10 dígitos."
          mono
          onCambio={(v) => onManual('celular', v)}
        />
        <Derivado etiqueta="RFC calculado" valor={datos.cliente.rfc} mono />
        <Derivado etiqueta="Razón social" valor={datos.cliente.razonSocial} />
      </Grupo>

      <Grupo titulo="Domicilio" detalle="Del comprobante" faltan={cuantas('domicilio')}>
        <Campo
          clave="domicilio.calle"
          etiqueta="Calle"
          valor={datos.domicilio.calle}
          falta={falta('domicilio.calle')}
          nota={
            lecturas.comprobante?.calle
              ? `En el recibo: «${lecturas.comprobante.calle}»`
              : 'Sin número; va aparte.'
          }
          onCambio={(v) => onLectura('comprobante', 'calle_nombre', v)}
        />
        <Campo
          clave="domicilio.numeroExterior"
          etiqueta="Número exterior"
          valor={datos.domicilio.numeroExterior}
          falta={falta('domicilio.numeroExterior')}
          mono
          onCambio={(v) => onLectura('comprobante', 'numero_exterior', v)}
        />
        <Campo
          etiqueta="Número interior"
          valor={datos.domicilio.numeroInterior}
          nota="Opcional."
          mono
          onCambio={(v) => onLectura('comprobante', 'numero_interior', v)}
        />
        <Campo
          etiqueta="Colonia"
          valor={lecturas.comprobante?.colonia}
          onCambio={(v) => onLectura('comprobante', 'colonia', v)}
        />
        <Campo
          etiqueta="Código postal"
          valor={lecturas.comprobante?.cp}
          mono
          onCambio={(v) => onLectura('comprobante', 'cp', v)}
          nota="Para buscar la colonia en SEPOMEX (lo hace el vendedor)."
        />
        <Campo
          etiqueta="Tiempo viviendo ahí"
          valor={lecturas.formulario?.antiguedad_domicilio}
          onCambio={(v) => onLectura('formulario', 'antiguedad_domicilio', v)}
        />
        <Derivado
          etiqueta="Antigüedad que se capturará"
          valor={`${datos.domicilio.antiguedadAnios} años, ${datos.domicilio.antiguedadMeses} meses`}
        />
      </Grupo>

      <Grupo titulo="Empleo" faltan={cuantas('empleo')}>
        <Campo
          clave="empleo.nombre"
          etiqueta="Nombre del trabajo"
          valor={lecturas.formulario?.empleo}
          falta={falta('empleo.nombre')}
          onCambio={(v) => onLectura('formulario', 'empleo', v)}
        />
        <Campo
          etiqueta="Dirección del trabajo"
          valor={lecturas.formulario?.direccion_empleo}
          onCambio={(v) => onLectura('formulario', 'direccion_empleo', v)}
        />
        <Campo
          etiqueta="Colonia del trabajo"
          valor={lecturas.formulario?.colonia_empleo}
          nota="Se busca en SEPOMEX si no hay CP."
          onCambio={(v) => onLectura('formulario', 'colonia_empleo', v)}
        />
        <Campo
          etiqueta="Antigüedad laboral"
          valor={lecturas.formulario?.antiguedad_laboral}
          onCambio={(v) => onLectura('formulario', 'antiguedad_laboral', v)}
        />
        <Campo
          etiqueta="Compañero de trabajo"
          valor={lecturas.formulario?.companero_nombre}
          onCambio={(v) => onLectura('formulario', 'companero_nombre', v)}
        />
        <Campo
          etiqueta="Teléfono del compañero"
          valor={lecturas.formulario?.companero_telefono}
          mono
          onCambio={(v) => onLectura('formulario', 'companero_telefono', v)}
        />
        <Campo
          etiqueta="Número de seguro social"
          valor={lecturas.formulario?.nss}
          nota="Opcional. Dinamo no tiene campo para él: solo de consulta."
          mono
          onCambio={(v) => onLectura('formulario', 'nss', v)}
        />
        <Campo
          etiqueta="Sueldo mensual"
          valor={datos.empleo.sueldo}
          nota="De los estados de cuenta."
          mono
          onCambio={(v) => onLectura('estadoCuenta1', 'sueldo_mensual', v)}
        />
        <Seleccion
          etiqueta="Frecuencia de pago"
          valor={datos.empleo.frecuenciaPago}
          opciones={[
            { value: 'SEMANAL', nombre: 'Semanal' },
            { value: 'QUINCENAL', nombre: 'Quincenal' },
            { value: 'MENSUAL', nombre: 'Mensual' },
          ]}
          onCambio={(v) => onLectura('estadoCuenta1', 'frecuencia_pago', v)}
        />
        <Derivado
          etiqueta="Antigüedad que se capturará"
          valor={`${datos.empleo.antiguedadAnios} años, ${datos.empleo.antiguedadMeses} meses`}
        />
      </Grupo>

      <Grupo
        titulo="Referencias"
        detalle={referencias.length > 1 ? 'Este tipo de crédito pide tres' : 'Este tipo de crédito pide una'}
        faltan={0}
      >
        <Seleccion
          etiqueta="Ciudad de los domicilios generados"
          valor={manual.ciudadReferencias ?? 'SALTILLO'}
          opciones={CIUDADES.map((ciudad) => ({ value: ciudad, nombre: ciudad }))}
          onCambio={(v) => onManual('ciudadReferencias', v)}
        />
        {referencias.map((sufijo, indice) => (
          <BloqueReferencia
            key={sufijo}
            sufijo={sufijo}
            numero={indice + 1}
            esPrimera={sufijo === 'ref'}
            lecturas={lecturas}
            manual={manual}
            onLectura={onLectura}
            onManual={onManual}
          />
        ))}
      </Grupo>
    </div>
  );
}

function Grupo({ titulo, detalle, faltan, children }) {
  return (
    <fieldset className={`grupo${faltan > 0 ? ' con-faltantes' : ''}`}>
      <legend>
        <span className="grupo-nombre">{titulo}</span>
        {detalle && <span className="grupo-detalle">{detalle}</span>}
        {faltan > 0 && (
          <span className="grupo-faltan">
            Falta{faltan > 1 ? 'n' : ''} {faltan}
          </span>
        )}
      </legend>
      <div className="rejilla-campos">{children}</div>
    </fieldset>
  );
}

/** Semilla estable por cliente y referencia: al reabrir el expediente sale igual. */
function semillaDe(curp, numero) {
  const base = String(curp ?? 'SIN-CURP');
  let suma = numero * 7919;
  for (let i = 0; i < base.length; i += 1) suma = (suma * 31 + base.charCodeAt(i)) >>> 0;
  return suma || 1;
}

function BloqueReferencia({ sufijo, numero, esPrimera, lecturas, manual, onLectura, onManual }) {
  const capturada = manual.referencias?.[sufijo] ?? {};
  const cambiar = (campo, valor) =>
    onManual('referencias', {
      ...manual.referencias,
      [sufijo]: { ...capturada, [campo]: valor },
    });

  function generar() {
    const generado = generarDomicilio(
      manual.ciudadReferencias ?? 'SALTILLO',
      semillaDe(lecturas.ineFrente?.curp, numero),
    );
    onManual('referencias', {
      ...manual.referencias,
      [sufijo]: { ...capturada, calle: generado.calle, numeroExterior: generado.numeroExterior },
    });
  }

  return (
    <div className="referencia">
      <div className="referencia-cabeza">
        <span className="referencia-titulo">Referencia {numero}</span>
        <button type="button" className="secundario chico" onClick={generar}>
          Generar domicilio
        </button>
      </div>
      <div className="rejilla-campos">
        {esPrimera ? (
          <>
            <Campo
              etiqueta="Nombre"
              valor={lecturas.formulario?.referencia_nombre}
              onCambio={(v) => onLectura('formulario', 'referencia_nombre', v)}
            />
            <Campo
              etiqueta="Teléfono"
              valor={lecturas.formulario?.referencia_telefono}
              mono
              onCambio={(v) => onLectura('formulario', 'referencia_telefono', v)}
            />
          </>
        ) : (
          <>
            <Campo
              etiqueta="Nombre"
              valor={capturada.nombreCompleto}
              onCambio={(v) => cambiar('nombreCompleto', v)}
            />
            <Campo
              etiqueta="Teléfono"
              valor={capturada.telefono}
              mono
              onCambio={(v) => cambiar('telefono', v)}
            />
          </>
        )}
        <Campo
          etiqueta="Calle"
          valor={capturada.calle}
          ficticio
          nota="Generada: calle real, no sale de ningún documento."
          onCambio={(v) => cambiar('calle', v)}
        />
        <Campo
          etiqueta="Número"
          valor={capturada.numeroExterior}
          ficticio
          nota="Generado."
          mono
          onCambio={(v) => cambiar('numeroExterior', v)}
        />
      </div>
    </div>
  );
}

function Campo({ clave, etiqueta, valor, falta, nota, ficticio, mono, onCambio }) {
  const generado = useId();
  const id = clave ? idDeFaltante(clave) : generado;
  const clases = ['campo'];
  if (falta) clases.push('falta');
  if (ficticio) clases.push('ficticio');

  return (
    <div className={clases.join(' ')}>
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        className={mono ? 'mono' : undefined}
        value={valor ?? ''}
        aria-invalid={falta || undefined}
        onChange={(evento) => onCambio(evento.target.value)}
        placeholder={falta ? 'Obligatorio' : ''}
      />
      {(nota || falta) && <span className="nota">{falta ? 'Falta este dato.' : nota}</span>}
    </div>
  );
}

function Seleccion({ clave, etiqueta, valor, opciones, nota, aviso, falta, vacio = 'Elegir…', onCambio }) {
  const generado = useId();
  const id = clave ? idDeFaltante(clave) : generado;
  const clases = ['campo'];
  if (aviso) clases.push('ficticio');
  if (falta) clases.push('falta');
  return (
    <div className={clases.join(' ')}>
      <label htmlFor={id}>{etiqueta}</label>
      <select
        id={id}
        value={valor ?? ''}
        aria-invalid={falta || undefined}
        onChange={(evento) => onCambio(evento.target.value)}
      >
        <option value="">{vacio}</option>
        {opciones.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.nombre}
          </option>
        ))}
      </select>
      {(nota || falta) && <span className="nota">{falta ? 'Falta este dato.' : nota}</span>}
    </div>
  );
}

function Derivado({ etiqueta, valor, mono }) {
  const id = useId();
  return (
    <div className="campo derivado">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} className={mono ? 'mono' : undefined} value={valor ?? ''} readOnly tabIndex={-1} />
      <span className="nota">Lo calcula la app.</span>
    </div>
  );
}
