import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ALTO, ANCHO, FORMATO } from '../lib/formatoSolicitud.js';
import './HojaSolicitud.css';

// La solicitud de crédito de Dinamo, redibujada sobre la geometría medida del
// formato de papel (lib/formatoSolicitud.js) y llenada «a pluma» en tinta azul.
//
// El formato va en blanco y negro, como el original: líneas y letras negras,
// barras grises y el logo en escala de grises. Solo lo escrito a mano es azul.
//
// Todo se dibuja en píxeles del escaneo (1006 × 1600) y el SVG lo estira a la
// hoja oficio de 216 × 340 mm. Cada etiqueta se ajusta al ancho exacto que
// mide en el original (textLength), así la letra cae donde caía.

const NEGRO = '#1a1a1a';
const TINTA = '#1c3f9e';
// Altura de las mayúsculas de Source Sans 3, en fracción del tamaño de letra.
const ALTURA_MAYUSCULA = 0.66;

// El escaneo se corre ~5 px a la izquierda de arriba abajo; la geometría ya
// viene enderezada y lo escrito a mano se endereza con la misma fórmula.
const X = (x, y) => x + (5.5 * (y - 171)) / 1220;

// Avisa a cada trazo cuando ya cargó la letra a mano, para volver a medir.
const FuentesListas = createContext(0);

/** Un número estable por texto, para que cada trazo se incline a su manera. */
function semilla(texto) {
  let h = 2166136261;
  for (const letra of texto) h = Math.imul(h ^ letra.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Lo escrito a mano, entre `x0` y `x1` sobre la línea base `b` (píxeles del
 * escaneo, sin enderezar). Si no cabe se escribe más chico y, al final, más
 * apretado. `centro` lo centra (las X de los paréntesis).
 */
function Tinta({ x0, x1, b, valor, centro, max = 14.5, min = 8 }) {
  const ref = useRef(null);
  const fuentes = useContext(FuentesListas);
  const texto = String(valor ?? '').trim();
  const ancho = x1 - x0;

  useLayoutEffect(() => {
    const trazo = ref.current;
    if (!trazo) return;
    trazo.removeAttribute('textLength');
    trazo.removeAttribute('lengthAdjust');
    let tamano = max;
    trazo.setAttribute('font-size', tamano);
    while (tamano > min && trazo.getComputedTextLength() > ancho) {
      tamano -= 0.5;
      trazo.setAttribute('font-size', tamano);
    }
    if (trazo.getComputedTextLength() > ancho) {
      trazo.setAttribute('textLength', ancho);
      trazo.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
  }, [texto, fuentes, ancho, max, min]);

  if (!texto) return null;
  const s = semilla(texto);
  const y = b + (semilla(`${texto}·`) - 0.5) * 2;
  const x = X(centro ? (x0 + x1) / 2 : x0, b);
  return (
    <text
      ref={ref}
      className="tinta"
      x={x}
      y={y}
      fill={TINTA}
      textAnchor={centro ? 'middle' : 'start'}
      transform={`rotate(${((s - 0.5) * 1.6).toFixed(2)} ${x.toFixed(1)} ${y.toFixed(1)})`}
    >
      {texto}
    </text>
  );
}

/** Una X dentro de un paréntesis. */
function Marca({ x, b, si }) {
  return si ? <Tinta x0={x - 6} x1={x + 6} b={b} valor="X" centro max={14} /> : null;
}

/** Un texto impreso del formato, al ancho exacto que tiene en el original. */
function Impreso({ t, x0, x1, b, h, p }) {
  return (
    <text
      x={x0}
      y={b}
      fontSize={h / ALTURA_MAYUSCULA}
      fontWeight={p}
      textLength={x1 - x0}
      lengthAdjust="spacingAndGlyphs"
    >
      {t}
    </text>
  );
}

/** El formato sin llenar: siempre igual, por eso se dibuja aparte. */
function Formato() {
  const { cabeza, lineas, rayas, barras, cajas, textos } = FORMATO;
  const [bx0, by0, bx1, by1] = cabeza.blanco;
  const [lx, ly, lw, lh] = cabeza.logo;

  return (
    <g>
      <defs>
        <linearGradient id="sol-gris-cabeza" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="rgb(180 180 180)" />
          <stop offset="1" stopColor="rgb(167 167 167)" />
        </linearGradient>
        <linearGradient id="sol-gris-barra" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="rgb(194 194 194)" />
          <stop offset="1" stopColor="rgb(174 174 174)" />
        </linearGradient>
        <filter id="sol-escala-grises">
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      <rect
        x={cabeza.x0}
        y={cabeza.y0}
        width={cabeza.x1 - cabeza.x0}
        height={cabeza.y1 - cabeza.y0}
        fill="url(#sol-gris-cabeza)"
      />
      <rect x={bx0} y={by0} width={bx1 - bx0} height={by1 - by0} fill="#fff" />
      <image
        href="/logo-dinamo.webp"
        x={lx}
        y={ly}
        width={lw}
        height={lh}
        filter="url(#sol-escala-grises)"
        preserveAspectRatio="none"
      />

      {barras.map(([y0, y1, x0, x1]) => (
        <rect key={`b${y0}`} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="url(#sol-gris-barra)" />
      ))}

      <g stroke={NEGRO} strokeWidth="1.7" strokeLinecap="square">
        {lineas.map(([y, x0, x1]) => (
          <line key={`l${y}-${x0}`} x1={x0} x2={x1} y1={y} y2={y} />
        ))}
        {rayas.map(([x, y0, y1]) => (
          <line key={`r${x}-${y0}`} x1={x} x2={x} y1={y0} y2={y1} />
        ))}
      </g>
      <g stroke={NEGRO} strokeWidth="1.5" fill="none">
        {cajas.map(([x0, y0, x1, y1]) => (
          <rect key={`c${x0}`} x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
        ))}
      </g>

      <g className="impreso" fill={NEGRO}>
        <text
          x={cabeza.titulo.x0}
          y={cabeza.titulo.b}
          fontSize={cabeza.titulo.h / ALTURA_MAYUSCULA}
          fontWeight="700"
          textLength={cabeza.titulo.x1 - cabeza.titulo.x0}
          lengthAdjust="spacingAndGlyphs"
          fill="#2b2b2b"
        >
          {cabeza.titulo.t}
        </text>
        <Impreso {...cabeza.fecha} p={600} />
        {textos.map((t, i) => (
          <Impreso key={i} {...t} />
        ))}
      </g>
    </g>
  );
}

/**
 * La hoja completa. `datos` es lo que devuelve `datosSolicitud`. Las
 * posiciones de lo escrito son píxeles del escaneo: arriba de cada etiqueta (o
 * de la línea, en los renglones con la etiqueta abajo), entre sus rayitas.
 * Lo que viene vacío no se escribe: se llena a mano.
 */
export default function HojaSolicitud({ datos: d }) {
  const [fuentes, setFuentes] = useState(0);

  useEffect(() => {
    let vigente = true;
    Promise.all([document.fonts.load('14px Kalam'), document.fonts.load('600 11px "Source Sans 3"')])
      .catch(() => {})
      .then(() => document.fonts.ready)
      .then(() => vigente && setFuentes((n) => n + 1));
    return () => {
      vigente = false;
    };
  }, []);

  const { venta: v, personal: p, domicilio: dom, empleo: e, referencias, fecha } = d;
  const refs = [0, 1, 2].map((i) => referencias[i] ?? {});
  const viv = dom.vivienda;

  return (
    <FuentesListas.Provider value={fuentes}>
      <article className="hoja" aria-label="Solicitud de crédito llenada">
        <svg
          className="hoja-svg"
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <Formato />

          <g>
            {/* Fecha */}
            <Tinta x0={737} x1={778} b={219} valor={fecha.dia} centro />
            <Tinta x0={783} x1={826} b={219} valor={fecha.mes} centro />
            <Tinta x0={831} x1={890} b={219} valor={fecha.anio} centro />

            {/* La venta: la etiqueta va arriba a la izquierda, así que se
                escribe sobre la línea a la derecha de ella. */}
            <Tinta x0={128} x1={574} b={297} valor={v.promotor} />
            <Tinta x0={636} x1={920} b={297} valor={v.agencia} />
            <Tinta x0={141} x1={440} b={331} valor={v.motocicleta} />
            <Tinta x0={502} x1={920} b={331} valor={v.importe} />
            <Tinta x0={126} x1={440} b={369} valor={v.enganche} />
            <Tinta x0={556} x1={668} b={369} valor={v.montoFinanciado} />
            <Tinta x0={720} x1={920} b={369} valor={v.plazo} />

            {/* Datos personales */}
            <Tinta x0={64} x1={212} b={451} valor={p.nombres} />
            <Tinta x0={215} x1={360} b={451} valor={p.apellidoPaterno} />
            <Tinta x0={362} x1={552} b={451} valor={p.apellidoMaterno} />
            <Tinta x0={562} x1={695} b={451} valor={p.fechaNacimiento} />
            <Tinta x0={704} x1={789} b={451} valor={p.nacionalidad} />
            <Tinta x0={798} x1={924} b={451} valor={p.estadoCivil} centro />
            <Tinta x0={64} x1={281} b={493} valor={p.rfc} />
            <Marca x={732} b={489} si={p.sexo === 'M'} />
            <Marca x={767} b={489} si={p.sexo === 'F'} />
            <Tinta x0={64} x1={488} b={537} valor={p.correo} />

            {/* Domicilio actual */}
            <Tinta x0={64} x1={428} b={597} valor={dom.calle} />
            <Tinta x0={437} x1={545} b={597} valor={dom.numeroExterior} />
            <Tinta x0={554} x1={653} b={597} valor={dom.numeroInterior} />
            <Tinta x0={662} x1={924} b={597} valor={dom.colonia} />
            <Tinta x0={62} x1={178} b={632} valor={dom.cp} />
            <Tinta x0={181} x1={285} b={632} valor={dom.ciudad} />
            <Tinta x0={288} x1={433} b={632} valor={dom.municipio} />
            <Tinta x0={436} x1={523} b={632} valor={dom.estado} />
            <Tinta x0={763} x1={805} b={643} valor={dom.antiguedad} centro max={12} min={7} />
            <Marca x={203} b={671} si={viv === 'PROPIA'} />
            <Marca x={282} b={671} si={viv === 'HIPOTECA'} />
            <Marca x={347} b={671} si={viv === 'FAMILIAR'} />
            <Marca x={203} b={681} si={viv === 'RENTADA'} />
            <Marca x={282.5} b={681} si={viv === 'PAGANDOLA'} />
            <Marca x={347} b={681} si={viv === 'OTRO'} />
            <Tinta x0={527} x1={711} b={669} valor={dom.celular} />

            {/* Empleo */}
            <Tinta x0={62} x1={612} b={901} valor={e.empresa} />
            <Tinta x0={62} x1={288} b={942} valor={e.calle} />
            <Tinta x0={292} x1={386} b={942} valor={e.numeroExterior} />
            <Tinta x0={389} x1={458} b={942} valor={e.numeroInterior} />
            {/* El código postal laboral no se sabe: la colonia puede ocupar su lugar. */}
            <Tinta x0={461} x1={612} b={942} valor={e.colonia} />
            <Tinta x0={463} x1={613} b={980} valor={e.antiguedad} />
            <Marca x={776} b={977} si={e.formaPago === 'ELECTRONICO'} />
            <Tinta x0={62} x1={356} b={1019} valor={e.puesto} />
            <Tinta x0={364} x1={613} b={1019} valor={e.jefe} />
            <Tinta x0={621} x1={773} b={1019} valor={e.frecuenciaPago} />
            <Tinta x0={781} x1={922} b={1019} valor={e.ingreso} />

            {/* Referencias */}
            {refs.map((ref, i) => {
              const b = [1428, 1464, 1501][i];
              return (
                <g key={i}>
                  <Tinta x0={62} x1={356} b={b} valor={ref.nombre} />
                  <Tinta x0={364} x1={773} b={b} valor={ref.domicilio} />
                  <Tinta x0={781} x1={917} b={b} valor={ref.telefono} />
                </g>
              );
            })}
          </g>
        </svg>
      </article>
    </FuentesListas.Provider>
  );
}
