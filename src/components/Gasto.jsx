import { useEffect, useState } from 'react';

import { EVENTO_GASTO, formatoUsd, gastoDeCaptura } from '../lib/gasto.js';

/**
 * Solo para admin: lo que lleva gastado en Gemini la captura en curso. Al
 * hacer clic abre la pestaña de consumo.
 */
export default function Gasto({ onAbrir }) {
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
      onClick={onAbrir}
      title="Gasto de Gemini de esta captura. Clic para ver el consumo."
    >
      Gemini {formatoUsd(captura.usd)}
    </button>
  );
}
