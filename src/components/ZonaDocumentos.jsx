import { useEffect, useRef, useState } from 'react';

import { DOCUMENTOS } from '../lib/documentos.js';

/**
 * Entrada de documentos.
 *
 * Lo rápido es soltar todo de golpe (o pegarlo con Ctrl+V desde WhatsApp Web):
 * Gemini dice qué es cada archivo y la app lo acomoda en su casilla y lo lee en
 * ese momento, sin botón de por medio. Las casillas siguen aceptando un archivo
 * directo, y cualquier archivo se puede mover si se acomodó mal.
 */
export default function ZonaDocumentos({
  ranuras,
  bandeja,
  onArchivos,
  onColocar,
  onMover,
  onQuitar,
  onDescartar,
  onReintentar,
}) {
  const selector = useRef(null);

  return (
    <section className="tarjeta">
      <h2>1. Documentos</h2>
      <p className="ayuda">
        Suelta todos los archivos juntos en cualquier parte de la página, pégalos con
        Ctrl+V o haz clic en el recuadro. Cada uno se identifica y se lee solo.
      </p>

      <button type="button" className="soltar-todo" onClick={() => selector.current?.click()}>
        <span className="soltar-todo-titulo">Suelta aquí los documentos del cliente</span>
        <span className="soltar-todo-detalle">
          INE (frente y reverso), comprobante de domicilio y estados de cuenta · fotos o PDF ·
          varios a la vez
        </span>
      </button>
      <input
        ref={selector}
        type="file"
        multiple
        hidden
        accept="image/*,application/pdf"
        onChange={(evento) => {
          onArchivos([...evento.target.files]);
          evento.target.value = '';
        }}
      />

      {bandeja.length > 0 && (
        <div className="bandeja">
          {bandeja.map((item) => (
            <div className={`bandeja-item ${item.estado}`} key={item.id}>
              <Miniatura archivo={item.archivo} />
              <div className="bandeja-texto">
                <span className="nombre-archivo">{item.archivo.name || 'Imagen pegada'}</span>
                <span className="estado-texto">
                  {item.estado === 'clasificando' ? 'Identificando…' : item.mensaje}
                </span>
              </div>
              {item.estado !== 'clasificando' && (
                <>
                  <select
                    value=""
                    onChange={(evento) => onColocar(evento.target.value, item.archivo, item.id)}
                  >
                    <option value="">¿Qué documento es?</option>
                    {DOCUMENTOS.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.etiqueta}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="mini" onClick={() => onDescartar(item.id)}>
                    Quitar
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rejilla-documentos">
        {DOCUMENTOS.map((doc, indice) => (
          <Casilla
            key={doc.id}
            documento={doc}
            orden={indice + 1}
            ranura={ranuras[doc.id]}
            onColocar={onColocar}
            onMover={onMover}
            onQuitar={onQuitar}
            onReintentar={onReintentar}
          />
        ))}
      </div>
    </section>
  );
}

const TEXTO_ESTADO = {
  leyendo: 'Leyendo…',
  listo: 'Leído',
  error: 'Error',
};

function Casilla({ documento, orden, ranura, onColocar, onMover, onQuitar, onReintentar }) {
  const [encima, setEncima] = useState(false);
  const selector = useRef(null);

  const clases = ['casilla'];
  if (encima) clases.push('encima');
  if (ranura) clases.push(ranura.estado);

  function soltar(evento) {
    evento.preventDefault();
    // Que no lo atrape también el soltado general de la página.
    evento.stopPropagation();
    setEncima(false);
    const [primero] = evento.dataTransfer.files;
    if (primero) onColocar(documento.id, primero);
  }

  return (
    <div
      className={clases.join(' ')}
      onDragOver={(evento) => {
        evento.preventDefault();
        evento.stopPropagation();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={soltar}
    >
      <div className="casilla-cabeza">
        <span className="orden">
          {orden}
          {documento.obligatorio ? '' : ' · opcional'}
        </span>
        {ranura && <span className={`estado ${ranura.estado}`}>{TEXTO_ESTADO[ranura.estado]}</span>}
      </div>
      <span className="titulo">{documento.etiqueta}</span>

      {ranura ? (
        <>
          <div className="casilla-archivo">
            <Miniatura archivo={ranura.archivo} />
            <span className="nombre-archivo">{ranura.archivo.name || 'Imagen pegada'}</span>
          </div>
          {ranura.estado === 'error' && <span className="error-casilla">{ranura.mensaje}</span>}
          <div className="casilla-acciones">
            <select
              value=""
              title="Mover a otra casilla"
              onChange={(evento) => onMover(documento.id, evento.target.value)}
            >
              <option value="">Mover a…</option>
              {DOCUMENTOS.filter((doc) => doc.id !== documento.id).map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.etiqueta}
                </option>
              ))}
            </select>
            {ranura.estado === 'error' && (
              <button type="button" className="mini" onClick={() => onReintentar(documento.id)}>
                Reintentar
              </button>
            )}
            <button type="button" className="mini" onClick={() => onQuitar(documento.id)}>
              Quitar
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="casilla-vacia" onClick={() => selector.current?.click()}>
          Arrastra o haz clic
        </button>
      )}

      <input
        ref={selector}
        type="file"
        hidden
        accept="image/*,application/pdf"
        onChange={(evento) => {
          const [primero] = evento.target.files;
          if (primero) onColocar(documento.id, primero);
          evento.target.value = '';
        }}
      />
    </div>
  );
}

/** Vista previa chica. Los PDF y los HEIC (que Edge no pinta) llevan etiqueta. */
function Miniatura({ archivo }) {
  const [url, setUrl] = useState(null);
  const [fallo, setFallo] = useState(false);
  const esImagen = archivo.type.startsWith('image/');

  useEffect(() => {
    if (!esImagen) return undefined;
    const creada = URL.createObjectURL(archivo);
    setUrl(creada);
    setFallo(false);
    return () => URL.revokeObjectURL(creada);
  }, [archivo, esImagen]);

  if (!esImagen || fallo || !url) {
    const extension = archivo.type === 'application/pdf' ? 'PDF' : 'IMG';
    return <span className="miniatura etiqueta">{extension}</span>;
  }

  return <img className="miniatura" src={url} alt="" onError={() => setFallo(true)} />;
}
