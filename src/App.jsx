import { useEffect, useMemo, useRef, useState } from 'react';

import ZonaDocumentos from './components/ZonaDocumentos.jsx';
import Formulario from './components/Formulario.jsx';
import TipoCredito from './components/TipoCredito.jsx';
import Paso from './components/Paso.jsx';
import Progreso from './components/Progreso.jsx';
import BarraAccion from './components/BarraAccion.jsx';
import { IconoAlerta, IconoCerrar } from './components/Iconos.jsx';
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
import { extrasAlManual, respaldoDelTexto } from './lib/formulario.js';
import { extensionDisponible, versionExtension, llenarConExtension } from './lib/extension.js';
import { esquemaPorValue, referenciasRequeridas } from './lib/esquemas.js';

// La moto (tipo de venta, modelo, color, plazo) la captura el vendedor en
// Dinamo; aquí solo queda lo que la extensión usa del cliente en adelante.
const MANUAL_INICIAL = {
  esquemaVenta: '',
  celular: '',
  // Correcciones a mano del sueldo y la frecuencia (mandan sobre el cálculo).
  sueldo: '',
  frecuenciaPago: '',
  ciudadReferencias: 'SALTILLO',
  referencias: {},
};

const SIN_TIPO = 'Primero elige el tipo de crédito de este cliente; después carga los documentos.';

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
  const [copiado, setCopiado] = useState(false);

  // La extensión se detecta al montar y no cambia mientras la pestaña vive.
  const [hayExtension] = useState(() => extensionDisponible());

  const expediente = useMemo(() => armarExpediente(lecturas, manual), [lecturas, manual]);

  // Cada captura empieza eligiendo el tipo de crédito; sin él no se carga nada.
  const tipoDefinido = Boolean(manual.esquemaVenta);

  const leyendoAlgo =
    Object.values(ranuras).some((ranura) => ranura.estado === 'leyendo') ||
    bandeja.some((item) => item.estado === 'clasificando') ||
    formEstado === 'leyendo';
  const hayLecturas = Object.keys(lecturas).length > 0;

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
      .then((leida) => {
        if (token !== formToken.current) return;
        // Lo que Gemini dejó vacío de las personas se busca directo en el texto.
        const lectura = respaldoDelTexto(leida, texto);
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
  manejadores.current = { agregarArchivos, leerFormulario, tipoDefinido, anotarError };

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
      if (!manejadores.current.tipoDefinido) {
        manejadores.current.anotarError(SIN_TIPO);
        return;
      }
      manejadores.current.agregarArchivos(evento.dataTransfer.files);
    }
    function alPegar(evento) {
      if (!manejadores.current.tipoDefinido) {
        if (evento.target.closest?.('input, textarea, select, [contenteditable]')) return;
        evento.preventDefault();
        manejadores.current.anotarError(SIN_TIPO);
        return;
      }
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
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- Estado de cada paso, para el mapa y los encabezados ------------------------

  const obligatorios = DOCUMENTOS.filter((doc) => doc.obligatorio);
  const leidos = obligatorios.filter((doc) => ranuras[doc.id]?.estado === 'listo').length;
  const docsLeyendo =
    Object.values(ranuras).some((ranura) => ranura.estado === 'leyendo') ||
    bandeja.some((item) => item.estado === 'clasificando');
  const conError = Object.values(ranuras).filter((ranura) => ranura.estado === 'error').length;
  const sinAcomodar = bandeja.filter((item) => item.estado === 'sin-identificar').length;
  const docsConProblema = conError > 0 || sinAcomodar > 0;

  let estadoDocs = 'pendiente';
  if (!tipoDefinido) estadoDocs = 'bloqueado';
  else if (docsConProblema) estadoDocs = 'atencion';
  else if (docsLeyendo) estadoDocs = 'en-curso';
  else if (leidos === obligatorios.length) estadoDocs = 'listo';

  let estadoForm = 'pendiente';
  if (!tipoDefinido) estadoForm = 'bloqueado';
  else if (formEstado === 'leyendo') estadoForm = 'en-curso';
  else if (formEstado === 'error') estadoForm = 'atencion';
  else if (formEstado === 'listo') estadoForm = 'listo';

  const faltanDatos = expediente.faltantes.filter((clave) => clave !== 'tipoCredito').length;
  let estadoRevision = 'pendiente';
  if (!tipoDefinido) estadoRevision = 'bloqueado';
  else if (hayLecturas && faltanDatos > 0) estadoRevision = 'atencion';
  else if (hayLecturas && !leyendoAlgo) estadoRevision = 'listo';

  const tipoElegido = esquemaPorValue(manual.esquemaVenta);
  const numReferencias = referenciasRequeridas(manual.esquemaVenta).length;
  const plural = (n, palabra) => `${n} ${palabra}${n === 1 ? '' : 's'}`;

  const pasos = [
    {
      id: 'paso-tipo',
      numero: 1,
      titulo: 'Tipo de crédito',
      estado: tipoDefinido ? 'listo' : 'pendiente',
      resumen: tipoElegido
        ? `${tipoElegido.nombre}. Pide ${numReferencias === 3 ? 'tres referencias' : 'una referencia'}.`
        : 'Elige el tipo de crédito de este cliente para empezar.',
      resumenCorto: tipoElegido?.nombre ?? 'Elegir',
    },
    {
      id: 'paso-documentos',
      numero: 2,
      titulo: 'Documentos',
      estado: estadoDocs,
      resumen: [
        `${leidos} de ${obligatorios.length} obligatorios leídos${
          ranuras.estadoCuenta2 ? ', más el estado de cuenta opcional' : ''
        }.`,
        conError > 0 && `${plural(conError, 'archivo')} con error.`,
        sinAcomodar > 0 &&
          `${plural(sinAcomodar, 'archivo')} sin reconocer: elige a dónde va${sinAcomodar > 1 ? 'n' : ''}.`,
      ]
        .filter(Boolean)
        .join(' '),
      resumenCorto: docsConProblema ? 'Revisar archivos' : `${leidos} de ${obligatorios.length} leídos`,
    },
    {
      id: 'paso-formulario',
      numero: 3,
      titulo: 'Formulario del vendedor',
      estado: estadoForm,
      resumen:
        formEstado === 'listo'
          ? 'Leído. Lo que trajo ya está en la revisión.'
          : 'Pega el mensaje que mandó el vendedor por WhatsApp.',
      resumenCorto:
        formEstado === 'listo' ? 'Leído' : formEstado === 'leyendo' ? 'Leyendo' : 'Pegar mensaje',
    },
    {
      id: 'paso-revision',
      numero: 4,
      titulo: 'Revisión',
      estado: estadoRevision,
      resumen: !hayLecturas
        ? 'Se arma sola con lo que lea Gemini.'
        : faltanDatos > 0
          ? `Falta${faltanDatos === 1 ? '' : 'n'} ${plural(faltanDatos, 'dato')} obligatorio${faltanDatos === 1 ? '' : 's'}.`
          : 'Todo lo obligatorio está completo.',
      resumenCorto: !hayLecturas
        ? 'Esperando'
        : faltanDatos > 0
          ? `Falta${faltanDatos === 1 ? '' : 'n'} ${faltanDatos}`
          : 'Completa',
    },
  ];
  const paso = Object.fromEntries(pasos.map((p) => [p.id, p]));
  const BLOQUEO = 'Primero elige el tipo de crédito.';

  return (
    <div className="app">
      {arrastrando && (
        <div className={`capa-soltar${tipoDefinido ? '' : ' bloqueada'}`}>
          <span>
            {tipoDefinido
              ? 'Suelta para agregar los documentos'
              : 'Primero elige el tipo de crédito'}
          </span>
        </div>
      )}

      <header className="barra-superior">
        <div className="barra-superior-interior">
          <div className="identidad">
            <span className="identidad-nombre">
              Captura <span>Automatizador</span>
            </span>
            <span className="identidad-detalle">Crédito Dinamo · no presiona Grabar</span>
          </div>
          <div className="barra-herramientas">
            <span className={`indicador ${hayExtension ? 'ok' : 'falla'}`}>
              <span className="punto" aria-hidden="true" />
              {hayExtension ? `Extensión v${versionExtension()}` : 'Sin extensión'}
            </span>
            <button type="button" className="fantasma" onClick={comprobarConexion}>
              Probar conexión
            </button>
            <button type="button" onClick={nuevoExpediente}>
              Nuevo expediente
            </button>
          </div>
        </div>
      </header>

      <div className="cuerpo">
        <aside className="lateral">
          <Progreso pasos={pasos} />
        </aside>

        <main className="contenido">
          {prueba && (
            <div
              className={`aviso ${prueba.ok ? 'verde' : prueba.ok === null ? 'neutro' : 'rojo'} con-cerrar`}
              role="status"
            >
              <span>{prueba.mensaje}</span>
              <button type="button" className="icono" aria-label="Cerrar" onClick={() => setPrueba(null)}>
                <IconoCerrar tamano={15} />
              </button>
            </div>
          )}

          {!hayExtension && (
            <div className="aviso ambar">
              <IconoAlerta tamano={16} />
              <span>
                Este navegador no tiene la extensión, así que no se puede llenar Dinamo desde aquí.
                Puedes preparar el expediente y copiarlo para capturarlo a mano.
              </span>
            </div>
          )}

          {errores.map((error) => (
            <div className="aviso rojo con-cerrar" key={error} role="alert">
              <span>{error}</span>
              <button
                type="button"
                className="icono"
                aria-label="Cerrar aviso"
                onClick={() => setErrores((previos) => previos.filter((e) => e !== error))}
              >
                <IconoCerrar tamano={15} />
              </button>
            </div>
          ))}

          <Paso {...paso['paso-tipo']}>
            <TipoCredito
              valor={manual.esquemaVenta}
              onCambio={(v) => {
                cambiarManual('esquemaVenta', v);
                setErrores((previos) => previos.filter((error) => error !== SIN_TIPO));
              }}
            />
          </Paso>

          <Paso {...paso['paso-documentos']} motivoBloqueo={BLOQUEO}>
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
          </Paso>

          <Paso {...paso['paso-formulario']} motivoBloqueo={BLOQUEO}>
            <Formulario
              texto={formTexto}
              estado={formEstado}
              mensaje={formMensaje}
              onTexto={setFormTexto}
              onLeer={leerFormulario}
            />
          </Paso>

          <Paso {...paso['paso-revision']} motivoBloqueo={BLOQUEO}>
            {hayLecturas ? (
              <Revision
                lecturas={lecturas}
                manual={manual}
                expediente={expediente}
                onLectura={corregirLectura}
                onManual={cambiarManual}
              />
            ) : (
              <p className="vacio">
                Cuando Gemini lea los documentos o el formulario, aquí aparecen los datos para
                revisarlos. Lo que falte se marca en rojo y abajo, junto al botón de llenar.
              </p>
            )}
          </Paso>

          <Bitacora eventos={eventos} />
        </main>
      </div>

      <BarraAccion
        hayLecturas={hayLecturas}
        leyendo={leyendoAlgo}
        faltantes={expediente.faltantes}
        hayExtension={hayExtension}
        llenando={llenando}
        copiado={copiado}
        onLlenar={llenar}
        onCopiar={copiarExpediente}
      />
    </div>
  );
}
