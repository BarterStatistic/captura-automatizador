import { useMemo, useState } from 'react';

import ZonaDocumentos from './components/ZonaDocumentos.jsx';
import Revision from './components/Revision.jsx';
import Bitacora from './components/Bitacora.jsx';

import { DOCUMENTOS } from './lib/documentos.js';
import {
  apiKeyGuardada,
  guardarApiKey,
  leerDocumento,
  ErrorGemini,
  URL_GEMINI,
} from './lib/gemini.js';
import { probarConexion } from './lib/diagnostico.js';
import { armarExpediente } from './lib/expediente.js';
import { extensionDisponible, versionExtension, llenarConExtension } from './lib/extension.js';

const MANUAL_INICIAL = {
  tipoVenta: '1',
  tipoUnidad: '1',
  esquemaVenta: '',
  subesquema: '',
  plazo: '',
  ubicacion: '',
  anio: '',
  modelo: '',
  color: '',
  servicioIncluido: 'si',
  celular: '',
  ciudadReferencias: 'SALTILLO',
  referencias: {},
};

export default function App() {
  const [apiKey, setApiKey] = useState(apiKeyGuardada());
  const [archivos, setArchivos] = useState({});
  const [lecturas, setLecturas] = useState({});
  const [manual, setManual] = useState(MANUAL_INICIAL);
  const [eventos, setEventos] = useState([]);
  const [leyendo, setLeyendo] = useState(false);
  const [llenando, setLlenando] = useState(false);
  const [errores, setErrores] = useState([]);
  const [prueba, setPrueba] = useState(null);

  // La extensión se detecta al montar y no cambia mientras la pestaña vive.
  const [hayExtension] = useState(() => extensionDisponible());

  const expediente = useMemo(() => armarExpediente(lecturas, manual), [lecturas, manual]);

  const obligatoriosCargados = DOCUMENTOS.filter((doc) => doc.obligatorio).every(
    (doc) => archivos[doc.id],
  );
  const hayLecturas = Object.keys(lecturas).length > 0;
  const listoParaLlenar = hayLecturas && expediente.faltantes.length === 0;

  function anotar(evento) {
    setEventos((previos) => [...previos, evento]);
  }

  async function leerTodo() {
    setLeyendo(true);
    setErrores([]);
    setEventos([]);

    const pendientes = DOCUMENTOS.filter((doc) => archivos[doc.id]);

    // Los seis van en paralelo: son peticiones independientes y esperar en fila
    // multiplicaría por seis lo que tarda el capturista frente a la pantalla.
    const resultados = await Promise.allSettled(
      pendientes.map((doc) => leerDocumento(doc, archivos[doc.id])),
    );

    const nuevas = {};
    const fallos = [];

    resultados.forEach((resultado, indice) => {
      const doc = pendientes[indice];
      if (resultado.status === 'fulfilled') {
        nuevas[doc.id] = resultado.value;
      } else {
        const causa = resultado.reason;
        fallos.push(
          `${doc.etiqueta}: ${causa instanceof ErrorGemini ? causa.message : String(causa)}`,
        );
      }
    });

    // Lo que sí se leyó se conserva: si falla un documento, no se pierde el
    // trabajo de los otros cinco ni hay que volver a subirlos.
    setLecturas((previas) => ({ ...previas, ...nuevas }));
    setErrores(fallos);
    setLeyendo(false);
  }

  function corregirLectura(documentoId, campo, valor) {
    setLecturas((previas) => ({
      ...previas,
      [documentoId]: { ...(previas[documentoId] ?? {}), [campo]: valor },
    }));
  }

  function cambiarManual(campo, valor) {
    setManual((previo) => ({ ...previo, [campo]: valor }));
  }

  async function llenar() {
    setLlenando(true);
    setEventos([]);
    await llenarConExtension({ datos: expediente.datos, manual }, anotar);
    setLlenando(false);
  }

  async function copiarExpediente() {
    await navigator.clipboard.writeText(
      JSON.stringify({ datos: expediente.datos, manual }, null, 2),
    );
  }

  async function comprobarConexion() {
    setPrueba({ ok: null, mensaje: 'Probando…' });
    setPrueba(await probarConexion(URL_GEMINI, apiKey));
  }

  function pedirApiKey() {
    const clave = window.prompt(
      'Pega tu API key de Gemini (aistudio.google.com/apikey).\n' +
        'Se guarda solo en este navegador, nunca se publica.',
      apiKey,
    );
    if (clave === null) return;
    guardarApiKey(clave);
    setApiKey(clave.trim());
  }

  return (
    <div className="envoltura">
      <header className="cabecera">
        <div>
          <h1>
            Captura <span>Automatizador</span>
          </h1>
          <p className="subtitulo">
            Seis documentos → Gemini → captura de crédito en Dinamo. No presiona Grabar.
          </p>
        </div>
        <div className="botones" style={{ marginTop: 0 }}>
          <span className={`insignia ${hayExtension ? 'si' : 'no'}`}>
            {hayExtension ? `Extensión v${versionExtension()}` : 'Sin extensión'}
          </span>
          <span className={`insignia ${apiKey ? 'si' : 'no'}`}>
            {apiKey ? 'API key lista' : 'Falta API key'}
          </span>
          <button type="button" onClick={pedirApiKey}>
            {apiKey ? 'Cambiar key' : 'Configurar key'}
          </button>
          <button type="button" className="secundario" onClick={comprobarConexion}>
            Probar conexión
          </button>
        </div>
      </header>

      {prueba && (
        <div className={`aviso ${prueba.ok ? 'ambar' : 'rojo'}`} style={{ whiteSpace: 'pre-wrap' }}>
          {prueba.mensaje}
        </div>
      )}

      {!hayExtension && (
        <div className="aviso ambar">
          No hay extensión instalada en este navegador, así que no se puede llenar Dinamo desde
          aquí. Puedes preparar el expediente igual y copiarlo para capturarlo a mano.
        </div>
      )}

      <ZonaDocumentos
        archivos={archivos}
        lecturas={lecturas}
        deshabilitado={leyendo || llenando}
        onArchivo={(id, archivo) => setArchivos((previos) => ({ ...previos, [id]: archivo }))}
      />

      {errores.map((error) => (
        <div className="aviso rojo" key={error} style={{ whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      ))}

      <div className="botones" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className="primario"
          disabled={!obligatoriosCargados || !apiKey || leyendo || llenando}
          onClick={leerTodo}
        >
          {leyendo ? 'Leyendo con Gemini…' : 'Leer documentos'}
        </button>
        {!apiKey && <span className="insignia no">Configura la API key primero</span>}
        {!obligatoriosCargados && apiKey && (
          <span className="insignia no">Faltan documentos obligatorios</span>
        )}
      </div>

      {hayLecturas && (
        <>
          <Revision
            lecturas={lecturas}
            manual={manual}
            expediente={expediente}
            onLectura={corregirLectura}
            onManual={cambiarManual}
          />

          <div className="botones" style={{ marginBottom: 20 }}>
            <button
              type="button"
              className="primario"
              disabled={!listoParaLlenar || !hayExtension || llenando}
              onClick={llenar}
            >
              {llenando ? 'Llenando en Dinamo…' : 'Llenar en Dinamo'}
            </button>
            <button type="button" className="secundario" onClick={copiarExpediente}>
              Copiar expediente
            </button>
            {expediente.faltantes.length > 0 && (
              <span className="insignia no">
                Faltan {expediente.faltantes.length} datos obligatorios
              </span>
            )}
          </div>
        </>
      )}

      <Bitacora eventos={eventos} />
    </div>
  );
}
