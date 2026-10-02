import { useEffect, useRef } from 'react';

const MARCAS = {
  inicio: '›',
  seccion: '■',
  campo: '✓',
  aviso: '!',
  error: '✕',
  fin: '●',
};

const CLASES = {
  campo: 'campo-ok',
  aviso: 'aviso-linea',
  error: 'error-linea',
  seccion: 'seccion-linea',
};

/** El avance del llenado, tal como lo va publicando la extensión. */
export default function Bitacora({ eventos }) {
  const fondo = useRef(null);

  // Sigue el avance sin que haya que perseguirlo con la rueda del ratón.
  useEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end' });
  }, [eventos.length]);

  if (eventos.length === 0) return null;

  return (
    <section className="avance" aria-live="polite">
      <h2>Avance del llenado en Dinamo</h2>
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
