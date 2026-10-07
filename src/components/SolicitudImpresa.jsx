import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import HojaSolicitud from './HojaSolicitud.jsx';
import { IconoCerrar, IconoImpresora } from './Iconos.jsx';
import { ESTADOS_CIVILES, VIVIENDAS } from '../lib/solicitud.js';

/**
 * El último paso: la solicitud de crédito de papel, llenada con el mismo
 * expediente. Aquí solo va el botón; la hoja y lo que se le agrega viven en la
 * ventana de impresión.
 */
export default function SolicitudImpresa({ puede, motivo, impresa, onAbrir }) {
  return (
    <div className="solicitud-paso">
      <p>
        Cuando la venta ya está grabada en Dinamo, imprime la solicitud de crédito de la agencia en
        hoja <strong>oficio</strong>, llenada en tinta azul con los mismos datos. Antes de imprimir
        puedes agregar la moto, el enganche y el promotor; lo que nadie sabe se queda en blanco
        para llenarlo a pluma.
      </p>
      <div className="pasos-dinamo-acciones">
        <button type="button" className="primario grande" disabled={!puede} onClick={onAbrir}>
          <IconoImpresora tamano={17} />
          {impresa ? 'Volver a imprimir la solicitud' : 'Imprimir solicitud de crédito'}
        </button>
        {motivo && <span className="pasos-dinamo-motivo">{motivo}</span>}
      </div>
    </div>
  );
}

/** Un campo de texto del panel; escribe directo en `impresion`. */
function Entrada({ campo, etiqueta, impresion, onCambio, placeholder, inputMode, refInicial }) {
  const id = `impresion-${campo}`;
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        ref={refInicial}
        value={impresion[campo]}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
        onChange={(evento) => onCambio(campo, evento.target.value)}
      />
    </div>
  );
}

function Selector({ campo, etiqueta, impresion, onCambio, opciones }) {
  const id = `impresion-${campo}`;
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <select id={id} value={impresion[campo]} onChange={(evento) => onCambio(campo, evento.target.value)}>
        <option value="">En blanco</option>
        {opciones.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * La ventana de impresión: a la izquierda lo que se agrega a mano, a la
 * derecha la hoja tal como va a salir. Al imprimir solo sale la hoja.
 */
export function VentanaSolicitud({ datos, impresion, onImpresion, onCerrar, onImpresa }) {
  const vistaRef = useRef(null);
  const hojaRef = useRef(null);
  const primeroRef = useRef(null);
  const [escala, setEscala] = useState(0.6);
  const [tamano, setTamano] = useState(null);

  const cambiar = (campo, valor) => onImpresion({ ...impresion, [campo]: valor });

  // Mientras la ventana está abierta, imprimir saca solo la hoja.
  useEffect(() => {
    document.documentElement.classList.add('con-solicitud');
    const anterior = document.activeElement;
    primeroRef.current?.focus();
    function alTeclear(evento) {
      if (evento.key === 'Escape') onCerrar();
    }
    window.addEventListener('keydown', alTeclear);
    return () => {
      document.documentElement.classList.remove('con-solicitud');
      window.removeEventListener('keydown', alTeclear);
      anterior?.focus?.();
    };
  }, [onCerrar]);

  // La hoja mide 216 mm; en pantalla se escala para que quepa a lo ancho.
  useLayoutEffect(() => {
    const vista = vistaRef.current;
    const hoja = hojaRef.current;
    if (!vista || !hoja) return;
    const ajustar = () => {
      const ancho = vista.clientWidth - 48;
      setEscala(Math.min(1, Math.max(0.3, ancho / hoja.offsetWidth)));
      setTamano({ ancho: hoja.offsetWidth, alto: hoja.offsetHeight });
    };
    ajustar();
    const observador = new ResizeObserver(ajustar);
    observador.observe(vista);
    return () => observador.disconnect();
  }, []);

  async function imprimir() {
    await document.fonts.ready;
    onImpresa();
    window.print();
  }

  // Lo que se calcula solo, para mostrarlo de ejemplo en el campo vacío.
  const financiadoCalculado = datos.venta.montoFinanciado;

  return createPortal(
    <div className="ventana-solicitud" role="dialog" aria-modal="true" aria-labelledby="solicitud-titulo">
      <aside className="solicitud-panel">
        <div className="solicitud-panel-cabeza">
          <h2 id="solicitud-titulo">Solicitud de crédito</h2>
          <button type="button" className="icono" aria-label="Cerrar" onClick={onCerrar}>
            <IconoCerrar tamano={17} />
          </button>
        </div>
        <p className="solicitud-nota">
          Lo del cliente ya viene del expediente. Agrega lo de la venta; lo que dejes vacío (y lo
          que no se sabe) sale en blanco para llenarlo a pluma. El tipo de persona no se marca.
        </p>

        <div className="solicitud-campos">
          <h3>La venta</h3>
          <Entrada campo="promotor" etiqueta="Promotor" impresion={impresion} onCambio={cambiar} refInicial={primeroRef} />
          <Entrada campo="agencia" etiqueta="Agencia" impresion={impresion} onCambio={cambiar} />
          <Entrada campo="motocicleta" etiqueta="Motocicleta" impresion={impresion} onCambio={cambiar} placeholder="Modelo y color" />
          <div className="solicitud-par">
            <Entrada campo="importe" etiqueta="Importe" impresion={impresion} onCambio={cambiar} inputMode="decimal" placeholder="$" />
            <Entrada campo="enganche" etiqueta="Enganche" impresion={impresion} onCambio={cambiar} inputMode="decimal" placeholder="$" />
          </div>
          <div className="solicitud-par">
            <Entrada
              campo="montoFinanciado"
              etiqueta="Monto financiado"
              impresion={impresion}
              onCambio={cambiar}
              inputMode="decimal"
              placeholder={financiadoCalculado || 'Importe − enganche'}
            />
            <Entrada campo="plazo" etiqueta="Plazo" impresion={impresion} onCambio={cambiar} placeholder="52 semanas" />
          </div>

          <h3>El cliente</h3>
          <div className="solicitud-par">
            <Selector
              campo="estadoCivil"
              etiqueta="Estado civil"
              impresion={impresion}
              onCambio={cambiar}
              opciones={ESTADOS_CIVILES.map((nombre) => ({ value: nombre, nombre }))}
            />
            <Selector campo="vivienda" etiqueta="Vivienda" impresion={impresion} onCambio={cambiar} opciones={VIVIENDAS} />
          </div>
          <Entrada campo="puesto" etiqueta="Puesto que ocupa" impresion={impresion} onCambio={cambiar} />
        </div>

        <div className="solicitud-imprimir">
          <button type="button" className="primario grande" onClick={imprimir}>
            <IconoImpresora tamano={17} />
            Imprimir
          </button>
          <p>
            En la ventana de impresión elige papel <strong>Oficio</strong>, escala{' '}
            <strong>100 %</strong> (o «Tamaño real») y sin encabezados ni pies de página.
          </p>
        </div>
      </aside>

      <div className="solicitud-vista" ref={vistaRef}>
        <div
          className="hoja-escala"
          style={tamano ? { width: tamano.ancho * escala, height: tamano.alto * escala } : undefined}
        >
          <div className="hoja-marco" ref={hojaRef} style={{ transform: `scale(${escala})` }}>
            <HojaSolicitud datos={datos} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
