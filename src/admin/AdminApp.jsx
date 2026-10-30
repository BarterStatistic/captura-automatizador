import { useEffect, useState } from 'react';

import { PantallaAcceso } from '../components/Acceso.jsx';
import { salir, sesionActual } from '../lib/sesion.js';
import Panel from './Panel.jsx';
import Usuarios from './Usuarios.jsx';

const SECCIONES = [
  { id: 'panel', nombre: 'Panel' },
  { id: 'usuarios', nombre: 'Usuarios' },
];

const TITULO = (
  <>
    Administración <span>Dinamo</span>
  </>
);

/**
 * /admin: login propio y, solo para el administrador, el panel de consumo y el
 * gestor de usuarios. La sesión es la misma cookie que la de la app; el
 * servidor vuelve a comprobar el rol en cada llamada (api/_admin.js).
 */
export default function AdminApp() {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState(null);
  const [seccion, setSeccion] = useState('panel');

  useEffect(() => {
    let vigente = true;
    sesionActual().then((actual) => {
      if (!vigente) return;
      setSesion(actual);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, []);

  async function cerrarSesion() {
    await salir();
    setSesion(null);
  }

  if (cargando) {
    return (
      <div className="acceso">
        <p className="acceso-cargando" role="status">
          Cargando…
        </p>
      </div>
    );
  }

  if (!sesion) {
    return <PantallaAcceso onEntrar={setSesion} titulo={TITULO} detalle="Acceso solo para el administrador" />;
  }

  if (sesion.rol !== 'admin') {
    return (
      <div className="acceso">
        <div className="acceso-tarjeta">
          <img className="acceso-logo" src="/logo-dinamo.webp" alt="Dinamo" width="73" height="48" />
          <h1 className="acceso-titulo">Sin acceso</h1>
          <p className="acceso-detalle">
            {sesion.usuario}, esta sección es solo para el administrador. Tu cuenta no tiene permiso.
          </p>
          <a className="admin-enlace" href="/">
            Volver a la captura
          </a>
          <button type="button" onClick={cerrarSesion}>
            Entrar con otra cuenta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="barra-superior">
        <div className="barra-superior-interior">
          <div className="identidad">
            <img className="identidad-logo" src="/logo-dinamo.webp" alt="Dinamo" width="73" height="48" />
            <div className="identidad-textos">
              <h1 className="admin-titulo">Administración</h1>
              <p className="admin-subtitulo">Captura Automatizador</p>
            </div>
          </div>
          <div className="barra-herramientas">
            <a className="admin-enlace" href="/">
              Ir a la captura
            </a>
            <span className="sesion-usuario" title="Sesión abierta">
              {sesion.usuario}
            </span>
            <button type="button" className="fantasma" onClick={cerrarSesion}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <nav className="pestanas" aria-label="Secciones">
        {SECCIONES.map((s) => (
          <button key={s.id} type="button" aria-current={seccion === s.id} onClick={() => setSeccion(s.id)}>
            {s.nombre}
          </button>
        ))}
      </nav>

      <main className="admin-cuerpo">
        {seccion === 'panel' ? (
          <Panel onSesionVencida={() => setSesion(null)} />
        ) : (
          <Usuarios yo={sesion.usuario} onSesionVencida={() => setSesion(null)} />
        )}
      </main>
    </div>
  );
}
