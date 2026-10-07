import { useEffect, useRef, useState } from 'react';

import App from '../App.jsx';
import { IconoAlerta } from './Iconos.jsx';
import { EVENTO_SESION_VENCIDA, entrar, salir, sesionActual } from '../lib/sesion.js';

/**
 * La puerta de la app: sin sesión solo se ve la pantalla de acceso. Si la
 * sesión vence a media captura, el acceso se abre encima de la app sin
 * desmontarla, para no perder lo que ya se leyó.
 */
export default function Acceso() {
  const [cargando, setCargando] = useState(true);
  const [usuario, setUsuario] = useState(null);
  const [vencida, setVencida] = useState(false);

  useEffect(() => {
    let vigente = true;
    sesionActual().then((nombre) => {
      if (!vigente) return;
      setUsuario(nombre);
      setCargando(false);
    });
    const alVencer = () => setVencida(true);
    window.addEventListener(EVENTO_SESION_VENCIDA, alVencer);
    return () => {
      vigente = false;
      window.removeEventListener(EVENTO_SESION_VENCIDA, alVencer);
    };
  }, []);

  if (cargando) {
    return (
      <div className="acceso">
        <p className="acceso-cargando" role="status">
          Cargando…
        </p>
      </div>
    );
  }

  if (!usuario) return <PantallaAcceso onEntrar={setUsuario} />;

  return (
    <>
      <App
        usuario={usuario}
        onSalir={async () => {
          await salir();
          setUsuario(null);
          setVencida(false);
        }}
      />
      {vencida && (
        <PantallaAcceso
          vencida
          usuarioInicial={usuario}
          onEntrar={(nombre) => {
            setUsuario(nombre);
            setVencida(false);
          }}
        />
      )}
    </>
  );
}

function PantallaAcceso({ onEntrar, vencida = false, usuarioInicial = '' }) {
  const [nombre, setNombre] = useState(usuarioInicial);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const passwordRef = useRef(null);
  const nombreRef = useRef(null);

  useEffect(() => {
    (usuarioInicial ? passwordRef : nombreRef).current?.focus();
  }, [usuarioInicial]);

  async function enviar(evento) {
    evento.preventDefault();
    if (!nombre.trim() || !password) {
      setError('Escribe tu usuario y tu contraseña.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      onEntrar(await entrar(nombre, password));
    } catch (exc) {
      setError(exc.message);
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={`acceso${vencida ? ' encima' : ''}`} role={vencida ? 'dialog' : undefined} aria-modal={vencida || undefined}>
      <form className="acceso-tarjeta" onSubmit={enviar} noValidate>
        <img className="acceso-logo" src="/logo-dinamo.webp" alt="Dinamo" width="73" height="48" />
        <h1 className="acceso-titulo">
          Captura <span>Automatizador</span>
        </h1>
        <p className="acceso-detalle">
          {vencida
            ? 'Tu sesión venció. Vuelve a entrar: lo que llevas capturado se conserva.'
            : 'Solicitud de crédito · Agencia Dinamo Saltillo'}
        </p>

        <div className="campo">
          <label htmlFor="acceso-usuario">Usuario</label>
          <input
            id="acceso-usuario"
            ref={nombreRef}
            value={nombre}
            autoComplete="username"
            autoCapitalize="words"
            spellCheck={false}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="acceso-password">Contraseña</label>
          <input
            id="acceso-password"
            ref={passwordRef}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p className="acceso-error" role="alert">
            <IconoAlerta tamano={15} />
            {error}
          </p>
        )}

        <button type="submit" className="primario grande" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
