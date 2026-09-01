import { useState } from 'react';

import { DOCUMENTOS, tipoAceptado } from '../lib/documentos.js';

/**
 * Las seis zonas donde se sueltan los documentos, en el orden en que se piden.
 *
 * Cada una acepta arrastre y clic. El tipo se valida aquí y no al leer: es
 * mejor avisar del formato en el momento de soltarlo que después de esperar a
 * Gemini.
 */
export default function ZonaDocumentos({ archivos, lecturas, onArchivo, deshabilitado }) {
  return (
    <section className="tarjeta">
      <h2>1. Documentos</h2>
      <p className="ayuda">
        Arrastra cada archivo a su casilla. Se aceptan fotos (JPG, PNG, HEIC) y PDF.
      </p>

      <div className="rejilla-documentos">
        {DOCUMENTOS.map((doc, indice) => (
          <Casilla
            key={doc.id}
            documento={doc}
            orden={indice + 1}
            archivo={archivos[doc.id]}
            leido={Boolean(lecturas[doc.id])}
            onArchivo={onArchivo}
            deshabilitado={deshabilitado}
          />
        ))}
      </div>
    </section>
  );
}

function Casilla({ documento, orden, archivo, leido, onArchivo, deshabilitado }) {
  const [encima, setEncima] = useState(false);
  const [error, setError] = useState('');

  function aceptar(archivoNuevo) {
    if (!archivoNuevo) return;
    if (!tipoAceptado(archivoNuevo.type)) {
      setError(`No se puede leer un ${archivoNuevo.type || 'archivo sin tipo'}.`);
      return;
    }
    setError('');
    onArchivo(documento.id, archivoNuevo);
  }

  const clases = ['soltar'];
  if (encima) clases.push('encima');
  if (archivo) clases.push('cargado');
  if (leido) clases.push('leido');

  return (
    <label
      className={clases.join(' ')}
      onDragOver={(evento) => {
        evento.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(evento) => {
        evento.preventDefault();
        setEncima(false);
        if (!deshabilitado) aceptar(evento.dataTransfer.files[0]);
      }}
    >
      <span className="orden">
        {orden}
        {documento.obligatorio ? '' : ' · opcional'}
      </span>
      <span className="titulo">{documento.etiqueta}</span>
      <span className="archivo">
        {error || (archivo ? archivo.name : 'Arrastra o haz clic')}
        {leido ? ' · leído' : ''}
      </span>
      <input
        type="file"
        accept="image/*,application/pdf"
        disabled={deshabilitado}
        onChange={(evento) => aceptar(evento.target.files[0])}
      />
    </label>
  );
}
