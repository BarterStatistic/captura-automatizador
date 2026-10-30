import { useEffect, useState } from 'react';

import { PERIODOS, TIPO_CAMBIO_MXN, formatoMxn, formatoUsd } from '../lib/gasto.js';
import { balanceDe } from './api.js';
import Grafica from './Grafica.jsx';

const dividir = (a, b) => (b ? a / b : 0);

function TiposDeCredito({ tipos }) {
  const maximo = Math.max(...tipos.map((t) => t.capturas), 1);
  return (
    <section className="admin-tarjeta" aria-labelledby="tipos-titulo">
      <h3 id="tipos-titulo">Tipos de crédito más utilizados</h3>
      {tipos.length === 0 ? (
        <p className="consumo-nota">Todavía no hay capturas en este periodo.</p>
      ) : (
        <ol className="barras">
          {tipos.map((t) => (
            <li key={t.tipo}>
              <div className="barras-texto">
                <span>{t.tipo}</span>
                <span>
                  {t.capturas} {t.capturas === 1 ? 'captura' : 'capturas'} · {formatoUsd(t.usd)}
                </span>
              </div>
              <div className="barras-pista" aria-hidden="true">
                <div className="barras-relleno" style={{ width: `${(t.capturas / maximo) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Vendedores({ filas }) {
  return (
    <section className="admin-tarjeta" aria-labelledby="vendedores-titulo">
      <h3 id="vendedores-titulo">Estadísticas por vendedor</h3>
      <div className="admin-tabla-caja">
        <table className="consumo-tabla admin-tabla">
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>Capturas</th>
              <th>Llamadas</th>
              <th>Gasto</th>
              <th>Por captura</th>
              <th>Crédito favorito</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.usuario}>
                <td>{fila.usuario}</td>
                <td>{fila.capturas}</td>
                <td>{fila.llamadas}</td>
                <td>{formatoUsd(fila.usd)}</td>
                <td>{formatoUsd(dividir(fila.usd, fila.capturas))}</td>
                <td className="admin-texto">{fila.tipo_favorito ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Resumen de uso: capturas, costo de la API de Gemini, tipos de crédito y cada vendedor. */
export default function Panel({ onSesionVencida }) {
  const [periodo, setPeriodo] = useState('mes');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    setError('');
    setDatos(null);
    balanceDe(periodo)
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch((exc) => {
        if (!vigente) return;
        if (exc.estado === 401) onSesionVencida();
        else setError(exc.message);
      });
    return () => {
      vigente = false;
    };
  }, [periodo, onSesionVencida]);

  const actual = PERIODOS.find((p) => p.id === periodo);
  const medio = datos ? dividir(datos.usd, datos.capturas) : 0;

  return (
    <section className="consumo" aria-labelledby="panel-titulo">
      <div className="consumo-cabecera">
        <div>
          <h2 id="panel-titulo">Resumen de uso</h2>
          <p className="consumo-nota">Periodo en curso: {actual.detalle}.</p>
        </div>
        <div className="consumo-periodos" role="group" aria-label="Periodo">
          {PERIODOS.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === periodo} onClick={() => setPeriodo(p.id)}>
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="aviso rojo" role="alert">
          <span>{error}</span>
        </div>
      )}
      {!error && !datos && <p className="consumo-nota">Cargando…</p>}

      {datos && (
        <>
          <dl className="consumo-cifras">
            <div>
              <dt>Capturas</dt>
              <dd>{datos.capturas}</dd>
              <small>veces que se usó la herramienta</small>
            </div>
            <div>
              <dt>Llamadas a Gemini</dt>
              <dd>{datos.llamadas}</dd>
            </div>
            <div>
              <dt>Gasto de la API</dt>
              <dd>{formatoUsd(datos.usd)} USD</dd>
              <small>≈ {formatoMxn(datos.usd)} MXN</small>
            </div>
            <div>
              <dt>Costo medio por captura</dt>
              <dd>{formatoUsd(medio)}</dd>
              <small>≈ {formatoMxn(medio)} MXN</small>
            </div>
          </dl>

          <Grafica serie={datos.serie} paso={datos.paso} />

          <div className="admin-rejilla">
            <TiposDeCredito tipos={datos.por_tipo ?? []} />
            <Vendedores filas={datos.por_usuario ?? []} />
          </div>
          <p className="consumo-nota">
            Pesos a ${TIPO_CAMBIO_MXN} por dólar (aproximado). «Sin dato» son capturas anteriores a que se guardara el
            tipo de crédito.
          </p>
        </>
      )}
    </section>
  );
}
