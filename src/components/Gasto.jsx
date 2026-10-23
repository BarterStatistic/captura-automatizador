import { useEffect, useRef, useState } from 'react';

import {
  EVENTO_GASTO,
  TIPO_CAMBIO_MXN,
  balanceDelMes,
  formatoMxn,
  formatoUsd,
  gastoDeCaptura,
} from '../lib/gasto.js';

/**
 * Lo que cuesta Gemini: el gasto de esta captura en la barra y, al abrirlo, el
 * balance del mes (llamadas, capturas, costo medio y desglose por usuario).
 */
export default function Gasto() {
  const [captura, setCaptura] = useState(gastoDeCaptura);
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(null);
  const [error, setError] = useState('');
  const caja = useRef(null);

  useEffect(() => {
    const alCambiar = (evento) => setCaptura(evento.detail);
    window.addEventListener(EVENTO_GASTO, alCambiar);
    return () => window.removeEventListener(EVENTO_GASTO, alCambiar);
  }, []);

  useEffect(() => {
    if (!abierto) return undefined;
    let vigente = true;
    setError('');
    balanceDelMes()
      .then((datos) => vigente && setMes(datos))
      .catch((exc) => vigente && setError(exc.message));
    const cerrarFuera = (evento) => {
      if (caja.current && !caja.current.contains(evento.target)) setAbierto(false);
    };
    document.addEventListener('pointerdown', cerrarFuera);
    return () => {
      vigente = false;
      document.removeEventListener('pointerdown', cerrarFuera);
    };
  }, [abierto]);

  const medio = mes?.capturas ? mes.usd / mes.capturas : 0;

  return (
    <div className="gasto" ref={caja}>
      <button
        type="button"
        className="fantasma gasto-boton"
        aria-expanded={abierto}
        onClick={() => setAbierto((previo) => !previo)}
        title="Gasto de Gemini de esta captura. Clic para ver el balance del mes."
      >
        Gemini {formatoUsd(captura.usd)}
      </button>

      {abierto && (
        <div className="gasto-panel" role="dialog" aria-label="Balance de gasto en Gemini">
          <h3>Esta captura</h3>
          <p className="gasto-cifra">
            {formatoUsd(captura.usd)} USD <span>≈ {formatoMxn(captura.usd)} MXN · {captura.llamadas} llamadas</span>
          </p>

          <h3>Este mes</h3>
          {error && <p className="gasto-error">{error}</p>}
          {!error && !mes && <p className="gasto-nota">Cargando…</p>}
          {mes && (
            <>
              <p className="gasto-cifra">
                {formatoUsd(mes.usd)} USD <span>≈ {formatoMxn(mes.usd)} MXN</span>
              </p>
              <dl className="gasto-datos">
                <div>
                  <dt>Capturas</dt>
                  <dd>{mes.capturas}</dd>
                </div>
                <div>
                  <dt>Llamadas</dt>
                  <dd>{mes.llamadas}</dd>
                </div>
                <div>
                  <dt>Costo medio por captura</dt>
                  <dd>
                    {formatoUsd(medio)} ({formatoMxn(medio)} MXN)
                  </dd>
                </div>
              </dl>
              {mes.por_usuario?.length > 0 && (
                <table className="gasto-tabla">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Capturas</th>
                      <th>USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mes.por_usuario.map((fila) => (
                      <tr key={fila.usuario}>
                        <td>{fila.usuario}</td>
                        <td>{fila.capturas}</td>
                        <td>{formatoUsd(fila.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
          <p className="gasto-nota">Pesos a ${TIPO_CAMBIO_MXN} por dólar (aproximado).</p>
        </div>
      )}
    </div>
  );
}
