import {
  ESQUEMAS_VENTA,
  PLAZOS,
  SUBESQUEMAS,
  TIPOS_UNIDAD,
  TIPOS_VENTA,
  referenciasRequeridas,
} from '../lib/esquemas.js';
import { CIUDADES, generarDomicilio } from '../lib/calles.js';

/**
 * Todo lo que se revisa antes de llenar: lo que leyó Gemini (editable, porque
 * una foto borrosa se corrige aquí y no en Dinamo), lo que solo sabe el
 * capturista, y lo que la app derivó de ambos.
 *
 * Editar un campo leído recalcula el expediente completo, así que el RFC y los
 * teléfonos partidos se actualizan solos.
 */
export default function Revision({ lecturas, manual, expediente, onLectura, onManual }) {
  const { datos, faltantes, avisos } = expediente;
  const falta = (nombre) => faltantes.includes(nombre);

  return (
    <section className="tarjeta">
      <h2>2. Revisión</h2>
      <p className="ayuda">
        Corrige aquí lo que Gemini haya leído mal. Lo marcado en rojo es obligatorio y
        mantiene apagado el botón de llenado.
      </p>

      {avisos.map((aviso) => (
        <div className="aviso ambar" key={aviso.campo + aviso.mensaje}>
          {aviso.mensaje}
        </div>
      ))}

      <div className="rejilla-campos">
        <h3 className="grupo-titulo">Cliente</h3>
        <Campo
          etiqueta="Nombre(s)"
          valor={lecturas.ineFrente?.nombres}
          falta={falta('nombres')}
          onCambio={(v) => onLectura('ineFrente', 'nombres', v)}
        />
        <Campo
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
          etiqueta="CURP"
          valor={lecturas.ineFrente?.curp}
          falta={falta('curp')}
          onCambio={(v) => onLectura('ineFrente', 'curp', v)}
        />
        <Campo
          etiqueta="OCR del reverso (13 dígitos)"
          valor={lecturas.ineAtras?.ocr}
          nota="Va a txtife y a idCIF. Opcional."
          onCambio={(v) => onLectura('ineAtras', 'ocr', v)}
        />
        <Campo
          etiqueta="Correo"
          valor={lecturas.formulario?.correo}
          falta={falta('correo')}
          onCambio={(v) => onLectura('formulario', 'correo', v)}
        />
        <Campo
          etiqueta="Celular del cliente"
          valor={manual.celular}
          falta={falta('celular')}
          nota="10 dígitos. Se parte en lada 3 + número 7."
          onCambio={(v) => onManual('celular', v)}
        />
        <Derivado etiqueta="RFC calculado" valor={datos.cliente.rfc} />
        <Derivado etiqueta="Razón social" valor={datos.cliente.razonSocial} />

        <h3 className="grupo-titulo">Domicilio (del comprobante)</h3>
        <Campo
          etiqueta="Calle y número"
          valor={lecturas.comprobante?.calle}
          falta={falta('domicilio.calle')}
          nota="Tal como viene en el recibo; la app lo separa."
          onCambio={(v) => onLectura('comprobante', 'calle', v)}
        />
        <Campo
          etiqueta="Colonia"
          valor={lecturas.comprobante?.colonia}
          onCambio={(v) => onLectura('comprobante', 'colonia', v)}
        />
        <Campo
          etiqueta="Código postal"
          valor={lecturas.comprobante?.cp}
          falta={falta('domicilio.cp')}
          onCambio={(v) => onLectura('comprobante', 'cp', v)}
        />
        <Campo
          etiqueta="Tiempo viviendo ahí"
          valor={lecturas.formulario?.antiguedad_domicilio}
          onCambio={(v) => onLectura('formulario', 'antiguedad_domicilio', v)}
        />
        <Derivado
          etiqueta="Se capturará como"
          valor={`${datos.domicilio.calle} ${datos.domicilio.numeroExterior}`.trim()}
        />

        <h3 className="grupo-titulo">Empleo</h3>
        <Campo
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
          nota="Se busca por colonia en SEPOMEX si no hay CP."
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
          onCambio={(v) => onLectura('formulario', 'companero_telefono', v)}
        />
        <Campo
          etiqueta="Sueldo mensual"
          valor={lecturas.estadoCuenta1?.sueldo_mensual}
          nota="De los estados de cuenta."
          onCambio={(v) => onLectura('estadoCuenta1', 'sueldo_mensual', v)}
        />
        <Seleccion
          etiqueta="Frecuencia de pago"
          valor={lecturas.estadoCuenta1?.frecuencia_pago ?? ''}
          opciones={[
            { value: 'SEMANAL', nombre: 'SEMANAL' },
            { value: 'QUINCENAL', nombre: 'QUINCENAL' },
            { value: 'MENSUAL', nombre: 'MENSUAL' },
          ]}
          onCambio={(v) => onLectura('estadoCuenta1', 'frecuencia_pago', v)}
        />
        <Derivado
          etiqueta="Antigüedad que se capturará"
          valor={`${datos.empleo.antiguedadAnios} años, ${datos.empleo.antiguedadMeses} meses`}
        />

        <h3 className="grupo-titulo">Venta</h3>
        <Seleccion
          etiqueta="Tipo de venta"
          valor={manual.tipoVenta}
          opciones={TIPOS_VENTA}
          onCambio={(v) => onManual('tipoVenta', v)}
        />
        <Seleccion
          etiqueta="Tipo de unidad"
          valor={manual.tipoUnidad}
          opciones={TIPOS_UNIDAD}
          onCambio={(v) => onManual('tipoUnidad', v)}
        />
        <Seleccion
          etiqueta="Esquema de venta"
          valor={manual.esquemaVenta}
          opciones={ESQUEMAS_VENTA}
          onCambio={(v) => onManual('esquemaVenta', v)}
        />
        <Seleccion
          etiqueta="Subesquema"
          valor={manual.subesquema}
          opciones={SUBESQUEMAS}
          onCambio={(v) => onManual('subesquema', v)}
        />
        <Seleccion
          etiqueta="Plazo"
          valor={manual.plazo}
          opciones={PLAZOS.map((p) => ({ value: p.value, nombre: `${p.meses} meses` }))}
          onCambio={(v) => onManual('plazo', v)}
        />
        <Campo
          etiqueta="Ubicación"
          valor={manual.ubicacion}
          nota="Se elige por texto en el catálogo de Dinamo."
          onCambio={(v) => onManual('ubicacion', v)}
        />
        <Campo etiqueta="Año" valor={manual.anio} onCambio={(v) => onManual('anio', v)} />
        <Campo etiqueta="Modelo" valor={manual.modelo} onCambio={(v) => onManual('modelo', v)} />
        <Campo etiqueta="Color" valor={manual.color} onCambio={(v) => onManual('color', v)} />
        <Seleccion
          etiqueta="Servicio preventivo 1"
          valor={manual.servicioIncluido}
          opciones={[
            { value: 'si', nombre: 'Incluido' },
            { value: 'no', nombre: 'No incluido' },
          ]}
          onCambio={(v) => onManual('servicioIncluido', v)}
        />

        <h3 className="grupo-titulo">
          Referencias{' '}
          {referenciasRequeridas(manual.esquemaVenta).length > 1
            ? '(este esquema pide tres)'
            : ''}
        </h3>
        <Seleccion
          etiqueta="Ciudad de los domicilios generados"
          valor={manual.ciudadReferencias ?? 'SALTILLO'}
          opciones={CIUDADES.map((ciudad) => ({ value: ciudad, nombre: ciudad }))}
          onCambio={(v) => onManual('ciudadReferencias', v)}
        />
        {referenciasRequeridas(manual.esquemaVenta).map((sufijo, indice) => (
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
      </div>
    </section>
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
    <>
      {esPrimera ? (
        <>
          <Campo
            etiqueta={`Referencia ${numero}: nombre`}
            valor={lecturas.formulario?.referencia_nombre}
            onCambio={(v) => onLectura('formulario', 'referencia_nombre', v)}
          />
          <Campo
            etiqueta={`Referencia ${numero}: teléfono`}
            valor={lecturas.formulario?.referencia_telefono}
            onCambio={(v) => onLectura('formulario', 'referencia_telefono', v)}
          />
        </>
      ) : (
        <>
          <Campo
            etiqueta={`Referencia ${numero}: nombre`}
            valor={capturada.nombreCompleto}
            onCambio={(v) => cambiar('nombreCompleto', v)}
          />
          <Campo
            etiqueta={`Referencia ${numero}: teléfono`}
            valor={capturada.telefono}
            onCambio={(v) => cambiar('telefono', v)}
          />
        </>
      )}
      <Campo
        etiqueta={`Referencia ${numero}: calle`}
        valor={capturada.calle}
        ficticio
        nota="Domicilio generado, no sale de ningún documento."
        onCambio={(v) => cambiar('calle', v)}
      />
      <Campo
        etiqueta={`Referencia ${numero}: número`}
        valor={capturada.numeroExterior}
        ficticio
        onCambio={(v) => cambiar('numeroExterior', v)}
      />
      <div className="campo">
        <label>&nbsp;</label>
        <button type="button" className="secundario" onClick={generar}>
          Generar domicilio {numero}
        </button>
        <span className="nota ficticio">Calle real de la zona, número inventado.</span>
      </div>
    </>
  );
}

function Campo({ etiqueta, valor, falta, nota, ficticio, onCambio }) {
  return (
    <div className={`campo${falta ? ' falta' : ''}`}>
      <label>{etiqueta}</label>
      <input
        value={valor ?? ''}
        onChange={(evento) => onCambio(evento.target.value)}
        placeholder={falta ? 'Obligatorio' : ''}
      />
      {(nota || falta) && (
        <span className={`nota${ficticio ? ' ficticio' : ''}`}>
          {falta ? 'Falta este dato.' : nota}
        </span>
      )}
    </div>
  );
}

function Seleccion({ etiqueta, valor, opciones, onCambio }) {
  return (
    <div className="campo">
      <label>{etiqueta}</label>
      <select value={valor ?? ''} onChange={(evento) => onCambio(evento.target.value)}>
        <option value="">— Elegir —</option>
        {opciones.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

function Derivado({ etiqueta, valor }) {
  return (
    <div className="campo">
      <label>{etiqueta}</label>
      <input value={valor ?? ''} readOnly tabIndex={-1} />
      <span className="nota">Lo calcula la app.</span>
    </div>
  );
}
