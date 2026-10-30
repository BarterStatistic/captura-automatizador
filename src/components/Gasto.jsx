import { useEffect, useState } from 'react';

import { EVENTO_GASTO, formatoUsd, gastoDeCaptura } from '../lib/gasto.js';

/**
 * Solo para admin: lo que lleva gastado en Gemini la captura en curso. 
 */
export default function Gasto() {
  const [captura, setCaptura] = useState(gastoDeCaptura);

  useEffect(() => {
    const alCambiar = (evento) => setCaptura(evento.detail);
    window.addEventListener(EVENTO_GASTO, alCambiar);
    return () => window.removeEventListener(EVENTO_GASTO, alCambiar);
  }, []);

  return (
    <button
      type="button"
      className="fantasma gasto-boton"
      onClick={() => window.open('/admin', '_blank', 'noopener')}
      title="Gasto de Gemini de esta captura. Clic para abrir el panel de administración."
    >
      Gemini {formatoUsd(captura.usd)}
    </button>
  );
}
