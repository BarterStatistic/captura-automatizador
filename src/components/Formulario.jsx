/**
 * El formulario que manda el vendedor, pegado tal cual.
 *
 * Al pegar se lee solo; si después se edita el texto a mano, se vuelve a leer
 * con el botón. Lo que se extrae aparece en la revisión, igual que lo de los
 * documentos.
 */
export default function Formulario({ texto, estado, mensaje, onTexto, onLeer }) {
  const etiquetas = {
    leyendo: 'Leyendo…',
    listo: 'Leído',
    error: 'Error',
  };

  return (
    <section className="tarjeta">
      <div className="titulo-con-estado">
        <h2>2. Formulario del vendedor</h2>
        {estado && <span className={`estado ${estado}`}>{etiquetas[estado]}</span>}
      </div>
      <p className="ayuda">
        Copia el mensaje completo que te mandó el vendedor (WhatsApp) y pégalo aquí. Se lee
        al pegarlo: correo, trabajo, antigüedades, referencias y, si vienen, celular, moto,
        esquema y plazo.
      </p>

      <textarea
        className="pegar-formulario"
        value={texto}
        placeholder={'1) Correo electrónico: …\n2) Nombre y dirección de su trabajo: …\n…'}
        onChange={(evento) => onTexto(evento.target.value)}
        onPaste={(evento) => {
          // Se deja pegar normal y se lee con el valor ya actualizado.
          const area = evento.currentTarget;
          setTimeout(() => onLeer(area.value), 0);
        }}
        rows={9}
      />

      {estado === 'error' && (
        <div className="aviso rojo" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>
          {mensaje}
        </div>
      )}

      <div className="botones">
        <button
          type="button"
          className="secundario"
          disabled={!texto.trim() || estado === 'leyendo'}
          onClick={() => onLeer(texto)}
        >
          {estado === 'listo' ? 'Volver a leer' : 'Leer formulario'}
        </button>
      </div>
    </section>
  );
}
