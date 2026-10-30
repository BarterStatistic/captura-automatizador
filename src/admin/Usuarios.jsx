import { useCallback, useEffect, useState } from 'react';

import { borrarUsuario, cambiarUsuario, crearUsuario, listarUsuarios } from './api.js';

const MIN_PASSWORD = 8;

const fecha = (iso) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Mexico_City' });

/** Formulario de alta (sin `usuario`) o de edición (con `usuario`). */
function FormularioUsuario({ usuario, onGuardar, onCancelar }) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const edicion = Boolean(usuario);

  async function enviar(evento) {
    evento.preventDefault();
    if (nombre.trim().length < 2) return setError('Escribe el nombre del usuario.');
    if ((!edicion || password) && password.length < MIN_PASSWORD) {
      return setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
    }
    setEnviando(true);
    setError('');
    try {
      await onGuardar({ nombre, ...(password ? { password } : {}) });
    } catch (exc) {
      setError(exc.message);
      setEnviando(false);
    }
  }

  return (
    <form className="admin-formulario" onSubmit={enviar} noValidate>
      <h3>{edicion ? `Editar a ${usuario.nombre}` : 'Nuevo usuario'}</h3>
      <div className="admin-formulario-campos">
        <div className="campo">
          <label htmlFor="usuario-nombre">Nombre</label>
          <input id="usuario-nombre" value={nombre} autoComplete="off" onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="usuario-password">{edicion ? 'Contraseña nueva (opcional)' : 'Contraseña'}</label>
          <input
            id="usuario-password"
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <p className="acceso-error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-formulario-acciones">
        <button type="submit" className="primario" disabled={enviando}>
          {enviando ? 'Guardando…' : edicion ? 'Guardar cambios' : 'Dar de alta'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Gestor de usuarios: alta, edición, activar o desactivar y baja. */
export default function Usuarios({ yo, onSesionVencida }) {
  const [usuarios, setUsuarios] = useState(null);
  const [error, setError] = useState('');
  // null | 'nuevo' | id del usuario que se edita
  const [abierto, setAbierto] = useState(null);

  const fallo = useCallback(
    (exc) => {
      if (exc.estado === 401) onSesionVencida();
      else setError(exc.message);
    },
    [onSesionVencida],
  );

  const cargar = useCallback(
    () =>
      listarUsuarios()
        .then((r) => {
          setError('');
          setUsuarios(r.usuarios);
        })
        .catch(fallo),
    [fallo],
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(accion) {
    await accion();
    setAbierto(null);
    await cargar();
  }

  async function alternar(u) {
    setError('');
    try {
      await cambiarUsuario(u.id, { activo: !u.activo });
      await cargar();
    } catch (exc) {
      fallo(exc);
    }
  }

  async function borrar(u) {
    if (!window.confirm(`¿Borrar a ${u.nombre}? Ya no podrá entrar. Su consumo anterior se conserva en el panel.`)) return;
    setError('');
    try {
      await borrarUsuario(u.id);
      await cargar();
    } catch (exc) {
      fallo(exc);
    }
  }

  return (
    <section className="consumo" aria-labelledby="usuarios-titulo">
      <div className="consumo-cabecera">
        <div>
          <h2 id="usuarios-titulo">Usuarios de la herramienta</h2>
          <p className="consumo-nota">Quién puede entrar a la captura. Los cambios se aplican al instante.</p>
        </div>
        {abierto !== 'nuevo' && (
          <button type="button" className="primario" onClick={() => setAbierto('nuevo')}>
            Nuevo usuario
          </button>
        )}
      </div>

      {error && (
        <div className="aviso rojo" role="alert">
          <span>{error}</span>
        </div>
      )}

      {abierto === 'nuevo' && (
        <FormularioUsuario
          onGuardar={(datos) => guardar(() => crearUsuario(datos))}
          onCancelar={() => setAbierto(null)}
        />
      )}

      {usuarios && typeof abierto === 'number' && (
        <FormularioUsuario
          key={abierto}
          usuario={usuarios.find((u) => u.id === abierto)}
          onGuardar={(datos) => guardar(() => cambiarUsuario(abierto, datos))}
          onCancelar={() => setAbierto(null)}
        />
      )}

      {!usuarios && !error && <p className="consumo-nota">Cargando…</p>}

      {usuarios && (
        <div className="admin-tabla-caja">
          <table className="consumo-tabla admin-tabla admin-tabla-texto">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Alta</th>
                <th>
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={u.activo ? '' : 'admin-inactivo'}>
                  <td className="admin-texto">
                    {u.nombre}
                    {u.nombre === yo && <span className="admin-etiqueta">tú</span>}
                  </td>
                  <td className="admin-texto">{u.rol === 'admin' ? 'Administrador' : 'Vendedor'}</td>
                  <td className="admin-texto">
                    <span className={`admin-estado ${u.activo ? 'activo' : ''}`}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td className="admin-texto">{fecha(u.creado)}</td>
                  <td className="admin-acciones">
                    <button type="button" onClick={() => setAbierto(u.id)}>
                      Editar
                    </button>
                    {u.rol !== 'admin' && (
                      <>
                        <button type="button" onClick={() => alternar(u)}>
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button type="button" className="admin-peligro" onClick={() => borrar(u)}>
                          Borrar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </section>
  );
}
