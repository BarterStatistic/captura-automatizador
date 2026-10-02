import { useEffect, useMemo, useRef, useState } from 'react';

import ZonaDocumentos from './components/ZonaDocumentos.jsx';
import Formulario from './components/Formulario.jsx';
import Revision from './components/Revision.jsx';
import Bitacora from './components/Bitacora.jsx';

import {
  CLASIFICADOR,
  DOCUMENTOS,
  FORMULARIO,
  documentoPorId,
  normalizarArchivo,
  ranurasPara,
  tipoAceptado,
} from './lib/documentos.js';
import { clasificarArchivo, leerDocumento, leerTexto, URL_API } from './lib/gemini.js';
import { probarConexion } from './lib/diagnostico.js';
import { armarExpediente } from './lib/expediente.js';
import { extrasAlManual } from './lib/formulario.js';
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

let contador = 0;
const nuevoId = () => `${Date.now().toString(36)}-${(contador += 1)}`;

const sin = (objeto, clave) => {
  const { [clave]: _, ...resto } = objeto;
  return resto;
};

export default function App() {
  // Cada casilla: { token, archivo, estado: 'leyendo' | 'listo' | 'error', mensaje }.
  // El ref es la copia síncrona: al acomodar dos estados de cuenta que llegan
  // casi juntos, el segundo tiene que ver que el primero ya ocupó su casilla.
  const [ranuras, setRanuras] = useState({});
  const ranurasRef = useRef({});
  const cambiarRanuras = (cambio) => {
    ranurasRef.current = cambio(ranurasRef.current);
    setRanuras(ranurasRef.current);
  };

  // Archivos que todavía no tienen casilla: identificándose o sin identificar.
  const [bandeja, setBandeja] = useState([]);

  const [lecturas, setLecturas] = useState({});
  const [manual, setManual] = useState(MANUAL_INICIAL);

  const [formTexto, setFormTexto] = useState('');
  const [formEstado, setFormEstado] = useState(null);
  const [formMensaje, setFormMensaje] = useState('');
  const formToken = useRef(0);

  const [errores, setErrores] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [llenando, setLlenando] = useState(false);
  const [prueba, setPrueba] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);

  // La extensión se detecta al montar y no cambia mientras la pestaña vive.
  const [hayExtension] = useState(() => extensionDisponible());

  const expediente = useMemo(() => armarExpediente(lecturas, manual), [lecturas, manual]);

  const leyendoAlgo =
    Object.values(ranuras).some((ranura) => ranura.estado === 'leyendo') ||
    bandeja.some((item) => item.estado === 'clasificando') ||
    formEstado === 'leyendo';
  const hayLecturas = Object.keys(lecturas).length > 0;
  const listoParaLlenar = hayLecturas && !leyendoAlgo && expediente.faltantes.length === 0;
  const faltanDocumentos = DOCUMENTOS.filter((doc) => doc.obligatorio && !ranuras[doc.id]);

  function anotarError(mensaje) {
    setErrores((previos) => (previos.includes(mensaje) ? previos : [...previos, mensaje]));
  }

  // --- Documentos -------------------------------------------------------------

  /** Pone un archivo en una casilla y lo lee en ese momento. */
  function colocar(ranuraId, archivo, desdeBandeja) {
    const documento = documentoPorId(ranuraId);
    if (!documento || !archivo) return;
    if (desdeBandeja) setBandeja((previa) => previa.filter((item) => item.id !== desdeBandeja));

    const token = nuevoId();
    cambiarRanuras((previas) => ({ ...previas, [ranuraId]: { token, archivo, estado: 'leyendo' } }));
    setLecturas((previas) => sin(previas, ranuraId));

    // Si mientras se lee cambian el archivo de la casilla, esta lectura ya no
    // vale: el token lo detecta y se descarta.
    const sigueVigente = () => ranurasRef.current[ranuraId]?.token === token;

    leerDocumento(documento, archivo)
      .then((lectura) => {
        if (!sigueVigente()) return;
        cambiarRanuras((previas) => ({
          ...previas,
          [ranuraId]: { ...previas[ranuraId], estado: 'listo', mensaje: '' },
        }));
        setLecturas((previas) => ({ ...previas, [ranuraId]: lectura }));
      })
      .catch((error) => {
        if (!sigueVigente()) return;
        cambiarRanuras((previas) => ({
          ...previas,
          [ranuraId]: { ...previas[ranuraId], estado: 'error', mensaje: error.message },
        }));
      });
  }

  function quitar(ranuraId) {
    cambiarRanuras((previas) => sin(previas, ranuraId));
    setLecturas((previas) => sin(previas, ranuraId));
  }

  /** Mueve un archivo a otra casilla; si estaba ocupada, intercambian lugar. */
  function mover(desde, hacia) {
    const origen = ranurasRef.current[desde];
    const destino = ranurasRef.current[hacia];
    if (!origen || !hacia) return;
    quitar(desde);
    colocar(hacia, origen.archivo);
    if (destino) colocar(desde, destino.archivo);
  }

  function reintentar(ranuraId) {
    const ranura = ranurasRef.current[ranuraId];
    if (ranura) colocar(ranuraId, ranura.archivo);
  }

  /** Lo que se suelta o se pega: se identifica cada archivo y se acomoda. */
  function agregarArchivos(lista) {
    const archivos = [...lista].map(normalizarArchivo);
    const rechazados = archivos.filter((archivo) => !tipoAceptado(archivo.type));
    if (rechazados.length > 0) {
      anotarError(
        `No se pueden leer: ${rechazados.map((archivo) => archivo.name).join(', ')}. ` +
          'Solo fotos (JPG, PNG, WEBP, HEIC) y PDF.',
      );
    }

    for (const archivo of archivos.filter((a) => tipoAceptado(a.type))) {
      const id = nuevoId();
      setBandeja((previa) => [...previa, { id, archivo, estado: 'clasificando' }]);

      const dejarEnBandeja = (mensaje) =>
        setBandeja((previa) =>
          previa.map((item) => (item.id === id ? { ...item, estado: 'sin-identificar', mensaje } : item)),
        );

      clasificarArchivo(CLASIFICADOR, archivo)
        .then((tipo) => {
          const destinos = ranurasPara(tipo, new Set(Object.keys(ranurasRef.current)));
          if (destinos.length === 0) {
            dejarEnBandeja('No parece INE, comprobante ni estado de cuenta. Elige a dónde va.');
            return;
          }
          setBandeja((previa) => previa.filter((item) => item.id !== id));
          destinos.forEach((destino) => colocar(destino, archivo));
        })
        .catch((error) => {
          dejarEnBandeja('No se pudo identificar. Elige a dónde va.');
          anotarError(error.message);
        });
    }
  }

  // --- Formulario -------------------------------------------------------------

  function leerFormulario(texto) {
    if (!String(texto ?? '').trim()) return;
    const token = (formToken.current += 1);
    setFormEstado('leyendo');
    setFormMensaje('');

    leerTexto(FORMULARIO, texto)
      .then((lectura) => {
        if (token !== formToken.current) return;
        setLecturas((previas) => ({ ...previas, formulario: lectura }));
        setManual((previo) => extrasAlManual(previo, lectura));
        setFormEstado('listo');
      })
      .catch((error) => {
        if (token !== formToken.current) return;
        setFormEstado('error');
        setFormMensaje(error.message);
      });
  }

  // --- Soltar y pegar en cualquier parte de la página --------------------------

  // Los manejadores globales se registran una vez y leen siempre la versión
  // más reciente de las funciones a través de este ref.
  const manejadores = useRef(null);
  manejadores.current = { agregarArchivos, leerFormulario };

  useEffect(() => {
    let profundidad = 0;
    const llevaArchivos = (evento) => [...(evento.dataTransfer?.types ?? [])].includes('Files');

    function alEntrar(evento) {
      if (!llevaArchivos(evento)) return;
      profundidad += 1;
      setArrastrando(true);
    }
    function alSalir(evento) {
      if (!llevaArchivos(evento)) return;
      profundidad = Math.max(0, profundidad - 1);
      if (profundidad === 0) setArrastrando(false);
    }
    function alPasar(evento) {
      if (llevaArchivos(evento)) evento.preventDefault();
    }
    // En captura: corre aunque una casilla detenga la propagación del soltado.
    function alSoltarCaptura() {
      profundidad = 0;
      setArrastrando(false);
    }
    function alSoltar(evento) {
      if (!llevaArchivos(evento)) return;
      evento.preventDefault();
      manejadores.current.agregarArchivos(evento.dataTransfer.files);
    }
    function alPegar(evento) {
      const archivos = [...(evento.clipboardData?.files ?? [])];
      if (archivos.length > 0) {
        evento.preventDefault();
        manejadores.current.agregarArchivos(archivos);
        return;
      }
      // Texto pegado fuera de un campo: es el formulario del vendedor.
      if (evento.target.closest?.('input, textarea, select, [contenteditable]')) return;
      const texto = evento.clipboardData?.getData('text') ?? '';
      if (!texto.trim()) return;
      evento.preventDefault();
      setFormTexto(texto);
      manejadores.current.leerFormulario(texto);
    }

    window.addEventListener('dragenter', alEntrar);
    window.addEventListener('dragleave', alSalir);
    window.addEventListener('dragover', alPasar);
    window.addEventListener('drop', alSoltarCaptura, true);
    window.addEventListener('drop', alSoltar);
    window.addEventListener('paste', alPegar);
    return () => {
      window.removeEventListener('dragenter', alEntrar);
      window.removeEventListener('dragleave', alSalir);
      window.removeEventListener('dragover', alPasar);
      window.removeEventListener('drop', alSoltarCaptura, true);
      window.removeEventListener('drop', alSoltar);
      window.removeEventListener('paste', alPegar);
    };
  }, []);

  // --- Lo demás -----------------------------------------------------------------

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
    await llenarConExtension({ datos: expediente.datos, manual }, (evento) =>
      setEventos((previos) => [...previos, evento]),
    );
    setLlenando(false);
  }

  async function copiarExpediente() {
    await navigator.clipboard.writeText(
      JSON.stringify({ datos: expediente.datos, manual }, null, 2),
    );
  }

  async function comprobarConexion() {
    setPrueba({ ok: null, mensaje: 'Probando…' });
    setPrueba(await probarConexion(URL_API));
  }

  function nuevoExpediente() {
    const hayAlgo = hayLecturas || bandeja.length > 0 || Object.keys(ranuras).length > 0 || formTexto;
    if (hayAlgo && !window.confirm('¿Empezar un expediente nuevo? Se borra todo lo de este cliente.')) {
      return;
    }
    cambiarRanuras(() => ({}));
    setBandeja([]);
    setLecturas({});
    setManual(MANUAL_INICIAL);
    formToken.current += 1;
    setFormTexto('');
    setFormEstado(null);
    setFormMensaje('');
    setErrores([]);
    setEventos([]);
    setPrueba(null);
  }

  return (
    <div className="envoltura">
      {arrastrando && (
        <div className="capa-soltar">
          <span>Suelta para agregar los documentos</span>
        </div>
      )}

      <header className="cabecera">
        <div>
          <h1>
            Captura <span>Automatizador</span>
          </h1>
          <p className="subtitulo">
            Documentos + formulario → Gemini → captura de crédito en Dinamo. No presiona Grabar.
          </p>
        </div>
        <div className="botones" style={{ marginTop: 0 }}>
          <span className={`insignia ${hayExtension ? 'si' : 'no'}`}>
            {hayExtension ? `Extensión v${versionExtension()}` : 'Sin extensión'}
          </span>
          <button type="button" className="secundario" onClick={comprobarConexion}>
            Probar conexión
          </button>
          <button type="button" onClick={nuevoExpediente}>
            Nuevo expediente
          </button>
        </div>
      </header>

      {prueba && (
        <div className={`aviso ${prueba.ok ? 'verde' : prueba.ok === null ? 'ambar' : 'rojo'}`} style={{ whiteSpace: 'pre-wrap' }}>
          {prueba.mensaje}
        </div>
      )}

      {!hayExtension && (
        <div className="aviso ambar">
          No hay extensión instalada en este navegador, así que no se puede llenar Dinamo desde
          aquí. Puedes preparar el expediente igual y copiarlo para capturarlo a mano.
        </div>
      )}

      {errores.map((error) => (
        <div className="aviso rojo con-cerrar" key={error} style={{ whiteSpace: 'pre-wrap' }}>
          <span>{error}</span>
          <button
            type="button"
            className="mini"
            onClick={() => setErrores((previos) => previos.filter((e) => e !== error))}
          >
            Cerrar
          </button>
        </div>
      ))}

      <div className="entrada">
        <ZonaDocumentos
          ranuras={ranuras}
          bandeja={bandeja}
          onArchivos={agregarArchivos}
          onColocar={colocar}
          onMover={mover}
          onQuitar={quitar}
          onDescartar={(id) => setBandeja((previa) => previa.filter((item) => item.id !== id))}
          onReintentar={reintentar}
        />

        <Formulario
          texto={formTexto}
          estado={formEstado}
          mensaje={formMensaje}
          onTexto={setFormTexto}
          onLeer={leerFormulario}
        />
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
            {leyendoAlgo && <span className="insignia no">Todavía se está leyendo…</span>}
            {faltanDocumentos.length > 0 && (
              <span className="insignia no">
                Sin cargar: {faltanDocumentos.map((doc) => doc.etiqueta).join(', ')}
              </span>
            )}
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
