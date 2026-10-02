import { TIPOS_CREDITO } from '../lib/esquemas.js';

/**
 * Lo primero de cada captura: el tipo de crédito. Hasta que no se elige, la
 * entrada de documentos y formulario queda bloqueada, porque decide cuántas
 * referencias se piden y cómo se llena el tipo de venta en Dinamo.
 *
 * Se puede cambiar después sin perder lo leído.
 */
export default function TipoCredito({ valor, onCambio }) {
  return (
    <div className="opciones-credito" role="radiogroup" aria-label="Tipo de crédito">
      {TIPOS_CREDITO.map((tipo) => {
        const activa = tipo.value === valor;
        const flex = tipo.nombre.endsWith(' FLEX');
        return (
          <button
            key={tipo.value}
            type="button"
            role="radio"
            aria-checked={activa}
            className={`opcion-credito${activa ? ' activa' : ''}`}
            onClick={() => onCambio(tipo.value)}
          >
            <span className="opcion-nombre">{flex ? tipo.nombre.replace(' FLEX', '') : tipo.nombre}</span>
            {flex && <span className="opcion-variante">Flex</span>}
          </button>
        );
      })}
    </div>
  );
}
