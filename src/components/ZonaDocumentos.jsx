import { useEffect, useRef, useState } from 'react';

import { DOCUMENTOS, esObligatorio } from '../lib/documentos.js';
import {
  IconoAlerta,
  IconoCerrar,
  IconoCheck,
  IconoDocumento,
  IconoReintentar,
  IconoSubir,
} from './Iconos.jsx';

/**
 * Entrada de documentos.
 *
 * Lo rápido es soltar todo de golpe (o pegarlo con Ctrl+V desde WhatsApp Web):
 * Gemini dice qué es cada archivo y la app lo acomoda en su casilla y lo lee en
 * ese momento, sin botón de por medio. Las casillas siguen aceptando un archivo
 * directo, y cualquier archivo se puede mover si se acomodó mal.
 */
export default function ZonaDocumentos({
  esquema,
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
    <div className="documentos">
      <button type="button" className="soltar-todo" onClick={() => selector.current?.click()}>
        <span className="soltar-todo-icono">
          <IconoSubir tamano={22} />
        </span>
        <span className="soltar-todo-texto">
          <span className="soltar-todo-titulo">Suelta aquí todos los documentos</span>
          <span className="soltar-todo-detalle">
            o haz clic para elegirlos, o pégalos con <kbd>Ctrl</kbd>+<kbd>V</kbd>. Fotos o PDF,
            varios a la vez: cada uno se reconoce y se acomoda solo.
          </span>
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
        <ul className="bandeja" aria-label="Archivos por acomodar">
          {bandeja.map((item) => (
            <li className={`bandeja-item ${item.estado}`} key={item.id}>
              <Miniatura archivo={item.archivo} />
              <div className="bandeja-texto">
                <span className="nombre-archivo">{item.archivo.name || 'Imagen pegada'}</span>
                <span className="estado-texto">
                  {item.estado === 'clasificando' ? (
                    <>
                      <span className="girando" aria-hidden="true" />
                      Reconociendo qué documento es…
                    </>
                  ) : (
                    item.mensaje
                  )}
                </span>
              </div>
              {item.estado !== 'clasificando' && (
                <div className="bandeja-acciones">
                  <select
                    value=""
                    aria-label="Elegir qué documento es"
                    onChange={(evento) => onColocar(evento.target.value, item.archivo, item.id)}
                  >
                    <option value="">¿Qué documento es?</option>
                    {DOCUMENTOS.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.etiqueta}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icono"
                    aria-label="Descartar archivo"
                    onClick={() => onDescartar(item.id)}
                  >
                    <IconoCerrar tamano={15} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ul className="rejilla-documentos">
        {DOCUMENTOS.map((doc) => (
          <Casilla
            key={doc.id}
            documento={doc}
            obligatorio={esObligatorio(doc, esquema)}
            ranura={ranuras[doc.id]}
            onColocar={onColocar}
            onMover={onMover}
            onQuitar={onQuitar}
            onReintentar={onReintentar}
          />
        ))}
      </ul>
    </div>
  );
}

const ESTADO = {
  leyendo: { texto: 'Leyendo', Icono: null },
  listo: { texto: 'Leído', Icono: IconoCheck },
  error: { texto: 'Error', Icono: IconoAlerta },
};

function Casilla({ documento, obligatorio, ranura, onColocar, onMover, onQuitar, onReintentar }) {
  const [encima, setEncima] = useState(false);
  const selector = useRef(null);

  const clases = ['casilla'];
  if (encima) clases.push('encima');
  clases.push(ranura ? ranura.estado : 'vacia');

  function soltar(evento) {
    evento.preventDefault();
    // Que no lo atrape también el soltado general de la página.
    evento.stopPropagation();
    setEncima(false);
    const [primero] = evento.dataTransfer.files;
    if (primero) onColocar(documento.id, primero);
  }

  const estado = ranura ? ESTADO[ranura.estado] : null;

  return (
    <li
      className={clases.join(' ')}
      onDragOver={(evento) => {
        evento.preventDefault();
        evento.stopPropagation();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={soltar}
    >
      {ranura ? (
        <div className="casilla-vista">
          <Miniatura archivo={ranura.archivo} grande />
          <span className={`estado-casilla ${ranura.estado}`}>
            {ranura.estado === 'leyendo' && <span className="girando" aria-hidden="true" />}
            {estado.Icono && <estado.Icono tamano={12} />}
            {estado.texto}
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="casilla-vista vacia"
          onClick={() => selector.current?.click()}
          aria-label={`Elegir archivo para ${documento.etiqueta}`}
        >
          <IconoSubir tamano={18} />
          <span>Soltar o elegir</span>
        </button>
      )}

      <div className="casilla-info">
        <span className="casilla-titulo">{documento.etiqueta}</span>
        <span className="casilla-sub">
          {ranura
            ? ranura.archivo.name || 'Imagen pegada'
            : [obligatorio ? 'Obligatorio' : 'Opcional en este crédito', documento.sub]
                .filter(Boolean)
                .join(' · ')}
        </span>
      </div>

      {ranura?.estado === 'error' && <p className="error-casilla">{ranura.mensaje}</p>}

      {ranura && (
        <div className="casilla-acciones">
          <select
            value=""
            aria-label={`Mover ${documento.etiqueta} a otra casilla`}
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
            <button
              type="button"
              className="icono"
              aria-label="Volver a leer"
              title="Volver a leer"
              onClick={() => onReintentar(documento.id)}
            >
              <IconoReintentar tamano={15} />
            </button>
          )}
          <button
            type="button"
            className="icono"
            aria-label={`Quitar ${documento.etiqueta}`}
            title="Quitar"
            onClick={() => onQuitar(documento.id)}
          >
            <IconoCerrar tamano={15} />
          </button>
        </div>
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
    </li>
  );
}

/** Vista previa. Los PDF y los HEIC (que Edge no pinta) llevan ícono. */
function Miniatura({ archivo, grande = false }) {
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

  const clase = `miniatura${grande ? ' grande' : ''}`;

  if (!esImagen || fallo || !url) {
    return (
      <span className={`${clase} sin-vista`}>
        <IconoDocumento tamano={grande ? 22 : 16} />
        <span>{archivo.type === 'application/pdf' ? 'PDF' : 'Imagen'}</span>
      </span>
    );
  }

  return <img className={clase} src={url} alt="" onError={() => setFallo(true)} />;
}
