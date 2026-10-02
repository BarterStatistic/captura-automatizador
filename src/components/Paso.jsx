import { IconoAlerta, IconoCandado, IconoCheck } from './Iconos.jsx';

/**
 * Un paso de la captura. Los pasos son una secuencia real (no se puede cargar
 * nada sin tipo de crédito, ni llenar sin revisar), así que el número sí dice
 * algo: en qué orden se trabaja.
 *
 * `estado`: pendiente | en-curso | listo | atencion | bloqueado.
 */
export default function Paso({ id, numero, titulo, resumen, estado, motivoBloqueo, extra, children }) {
  const bloqueado = estado === 'bloqueado';

  return (
    <section id={id} className={`paso ${estado}`} aria-labelledby={`${id}-titulo`}>
      <header className="paso-cabeza">
        <MarcaPaso numero={numero} estado={estado} />
        <div className="paso-titulos">
          <h2 id={`${id}-titulo`}>{titulo}</h2>
          {resumen && <p className="paso-resumen">{resumen}</p>}
        </div>
        {extra && <div className="paso-extra">{extra}</div>}
      </header>

      {bloqueado && motivoBloqueo && (
        <p className="paso-bloqueo">
          <IconoCandado tamano={14} />
          {motivoBloqueo}
        </p>
      )}

      <div className="paso-cuerpo" inert={bloqueado}>
        {children}
      </div>
    </section>
  );
}

/** El círculo con el número, o la palomita / alerta cuando el paso cambia. */
export function MarcaPaso({ numero, estado }) {
  let contenido = numero;
  if (estado === 'listo') contenido = <IconoCheck tamano={14} />;
  if (estado === 'atencion') contenido = <IconoAlerta tamano={14} />;

  return (
    <span className={`marca-paso ${estado}`} aria-hidden="true">
      {contenido}
    </span>
  );
}
