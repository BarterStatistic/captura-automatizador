import { IconoCheck, IconoFlecha } from './Iconos.jsx';

// La misma pantalla que abre la extensión. Se abre en otra pestaña para que el
// vendedor capture ahí la moto; la extensión la reconoce y la llena sin
// recargarla.
export const URL_CAPTURA_DINAMO =
  'http://dinamo2.intranet/dscn/dscframe/Nwcreditoscj/dsc_captura_2022.php?tipo_captura=CREDINAMO';

/**
 * El último paso, en el orden en que se hace de verdad: primero la moto, a
 * mano en Dinamo; después «Llenar en Dinamo» desde aquí. El botón no se
 * habilita hasta que el capturista confirma que la moto ya está, porque la
 * extensión llena sobre una venta ya armada.
 */
export default function CapturaDinamo({
  motoLista,
  onMotoLista,
  puedeLlenar,
  motivo,
  llenando,
  onLlenar,
  children,
}) {
  return (
    <div className="captura-dinamo">
      <ol className="pasos-dinamo">
        <li className={motoLista ? 'hecho' : 'actual'}>
          <span className="pasos-dinamo-numero" aria-hidden="true">
            {motoLista ? <IconoCheck tamano={14} /> : 'A'}
          </span>
          <div className="pasos-dinamo-texto">
            <h3>Captura la moto en Dinamo</h3>
            <p>
              En la pantalla de captura de Dinamo elige el tipo de venta, el modelo, el color, el
              plazo y el servicio. Eso lo hace el vendedor: la extensión no toca la moto.
            </p>
            <div className="pasos-dinamo-acciones">
              <a className="boton secundario" href={URL_CAPTURA_DINAMO} target="_blank" rel="noreferrer">
                Abrir la captura de Dinamo
              </a>
              <label className="confirmar-moto">
                <input
                  type="checkbox"
                  checked={motoLista}
                  onChange={(evento) => onMotoLista(evento.target.checked)}
                />
                Ya capturé la moto en Dinamo
              </label>
            </div>
          </div>
        </li>

        <li className={!motoLista ? 'espera' : 'actual'}>
          <span className="pasos-dinamo-numero" aria-hidden="true">
            B
          </span>
          <div className="pasos-dinamo-texto">
            <h3>Llena el resto desde aquí</h3>
            <p>
              Con la captura de Dinamo abierta, presiona el botón. La extensión llena del cliente a
              las referencias y al final te deja la lista de lo que queda a mano. Grabar lo
              presionas tú.
            </p>
            <div className="pasos-dinamo-acciones">
              <button
                type="button"
                className="primario grande"
                disabled={!puedeLlenar || llenando}
                onClick={onLlenar}
              >
                {llenando ? 'Llenando en Dinamo…' : 'Llenar en Dinamo'}
                {!llenando && <IconoFlecha tamano={16} />}
              </button>
              {motivo && <span className="pasos-dinamo-motivo">{motivo}</span>}
            </div>
          </div>
        </li>
      </ol>

      {children}
    </div>
  );
}
