import { useEffect, useRef } from 'react';

const MARCAS = {
  inicio: '›',
  seccion: '■',
  campo: '✓',
  aviso: '!',
  error: '✕',
  fin: '●',
  resumen: '☐',
};

const CLASES = {
  campo: 'campo-ok',
  aviso: 'aviso-linea',
  error: 'error-linea',
  seccion: 'seccion-linea',
};

/**
 * Lo que la extensión no hace y le toca al vendedor: colonias, «Validar
 * Datos», preguntas de Dinamo, datos que no venían. Va arriba de la bitácora
 * porque es lo único de la corrida que exige hacer algo.
 */
function Pendientes({ resumen }) {
  const lista = Array.isArray(resumen.pendientes) ? resumen.pendientes : [];
  if (lista.length === 0) {
    return <p className="pendientes-vacio">Nada pendiente: solo revisa y presiona Grabar.</p>;
  }
  return (
    <div className="pendientes" role="region" aria-label="Pendiente a mano">
      <h3>Pendiente a mano</h3>
      <p>{resumen.mensaje}</p>
      <ol>
        {lista.map((texto) => (
          <li key={texto}>{texto}</li>
        ))}
      </ol>
    </div>
  );
}

/** El avance del llenado, tal como lo va publicando la extensión. */
export default function Bitacora({ eventos }) {
  const fondo = useRef(null);

  // Sigue el avance sin que haya que perseguirlo con la rueda del ratón.
  useEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end' });
  }, [eventos.length]);

  if (eventos.length === 0) return null;

  const resumen = eventos.findLast((evento) => evento.tipo === 'resumen');

  return (
    <section className="avance" aria-live="polite">
      <h2>Avance del llenado en Dinamo</h2>
      {resumen && <Pendientes resumen={resumen} />}
      <div className="bitacora">
        {eventos.map((evento, indice) => (
          <div className={`linea ${CLASES[evento.tipo] ?? ''}`} key={indice}>
            <span className="marca">{MARCAS[evento.tipo] ?? '·'}</span>
            <span>{evento.mensaje}</span>
          </div>
        ))}
        <div ref={fondo} />
      </div>
    </section>
  );
}
