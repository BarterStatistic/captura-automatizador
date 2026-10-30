import { useMemo, useState } from 'react';

import { formatoUsd } from '../lib/gasto.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// «2026-10-19T14:00:00» ya viene en hora de México: se lee por partes, sin
// pasar por Date, para que la zona del navegador no la mueva.
function partes(t) {
  const [fecha, hora = '00'] = String(t).split('T');
  const [, mes, dia] = fecha.split('-').map(Number);
  return { mes, dia, hora: hora.slice(0, 2) };
}

function etiqueta(t, paso) {
  const { mes, dia, hora } = partes(t);
  if (paso === 'hour') return `${hora}:00`;
  return `${dia} ${MESES[mes - 1]}`;
}

function etiquetaLarga(t, paso) {
  if (paso === 'hour') return `${etiqueta(t, paso)} h`;
  if (paso === 'week') return `Semana del ${etiqueta(t, paso)}`;
  return etiqueta(t, paso);
}

/** Tope «redondo» para el eje vertical. */
function techo(max) {
  if (max <= 0) return 0.01;
  const potencia = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].find((m) => m * potencia >= max) * potencia;
}

const ANCHO = 760;
const ALTO = 280;
const MARGEN = { izq: 56, der: 16, arr: 14, aba: 30 };

/** Línea del gasto en dólares a lo largo del periodo, con lectura al pasar el cursor. */
export default function Grafica({ serie, paso }) {
  const [activo, setActivo] = useState(null);

  const { puntos, camino, area, marcasY, marcasX } = useMemo(() => {
    const ancho = ANCHO - MARGEN.izq - MARGEN.der;
    const alto = ALTO - MARGEN.arr - MARGEN.aba;
    const tope = techo(Math.max(...serie.map((p) => p.usd), 0));
    const x = (i) => MARGEN.izq + (serie.length > 1 ? (i / (serie.length - 1)) * ancho : ancho / 2);
    const y = (v) => MARGEN.arr + alto - (v / tope) * alto;

    const pts = serie.map((p, i) => ({ ...p, x: x(i), y: y(p.usd) }));
    const linea = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const base = MARGEN.arr + alto;
    const areaPath = pts.length
      ? `${linea} L${pts[pts.length - 1].x.toFixed(1)} ${base} L${pts[0].x.toFixed(1)} ${base} Z`
      : '';

    const cuantas = Math.min(serie.length, 7);
    const saltos = new Set(
      Array.from({ length: cuantas }, (_, k) => Math.round((k * (serie.length - 1)) / Math.max(cuantas - 1, 1))),
    );
    return {
      puntos: pts,
      camino: linea,
      area: areaPath,
      marcasY: [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: y(tope * f), valor: tope * f })),
      marcasX: pts.filter((_, i) => saltos.has(i)),
    };
  }, [serie]);

  const seleccionado = activo != null ? puntos[activo] : null;

  return (
    <div className="grafica">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label="Gasto en dólares a lo largo del periodo"
        onMouseLeave={() => setActivo(null)}
      >
        {marcasY.map((m) => (
          <g key={m.y}>
            <line x1={MARGEN.izq} x2={ANCHO - MARGEN.der} y1={m.y} y2={m.y} className="grafica-rejilla" />
            <text x={MARGEN.izq - 8} y={m.y + 4} textAnchor="end" className="grafica-texto">
              {formatoUsd(m.valor)}
            </text>
          </g>
        ))}
        {marcasX.map((p) => (
          <text key={p.t} x={p.x} y={ALTO - 8} textAnchor="middle" className="grafica-texto">
            {etiqueta(p.t, paso)}
          </text>
        ))}
        <path d={area} className="grafica-area" />
        <path d={camino} className="grafica-linea" />
        {puntos.map((p, i) => (
          <g key={p.t}>
            <rect
              x={p.x - ANCHO / puntos.length / 2}
              y={MARGEN.arr}
              width={ANCHO / puntos.length}
              height={ALTO - MARGEN.arr - MARGEN.aba}
              fill="transparent"
              onMouseEnter={() => setActivo(i)}
            />
            <circle cx={p.x} cy={p.y} r={activo === i ? 5 : puntos.length > 40 ? 0 : 3} className="grafica-punto" />
          </g>
        ))}
        {seleccionado && (
          <line
            x1={seleccionado.x}
            x2={seleccionado.x}
            y1={MARGEN.arr}
            y2={ALTO - MARGEN.aba}
            className="grafica-guia"
            pointerEvents="none"
          />
        )}
      </svg>

      <div className="grafica-lectura" aria-live="polite">
        {seleccionado ? (
          <>
            <strong>{etiquetaLarga(seleccionado.t, paso)}</strong>
            <span>
              {formatoUsd(seleccionado.usd)} USD · {seleccionado.llamadas} llamadas · {seleccionado.capturas} capturas
            </span>
          </>
        ) : (
          <span>Pasa el cursor sobre la gráfica para ver cada punto.</span>
        )}
      </div>
    </div>
  );
}
