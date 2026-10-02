import { IconoReintentar } from './Iconos.jsx';

/**
 * El formulario que manda el vendedor, pegado tal cual.
 *
 * Al pegar se lee solo; si después se edita el texto a mano, se vuelve a leer
 * con el botón. Lo que se extrae aparece en la revisión, igual que lo de los
 * documentos.
 */
export default function Formulario({ texto, estado, mensaje, onTexto, onLeer }) {
  return (
    <div className="formulario">
      <label className="formulario-etiqueta" htmlFor="texto-formulario">
        Mensaje del vendedor
      </label>
      <textarea
        id="texto-formulario"
        className="pegar-formulario"
        value={texto}
        placeholder={
          'Pega aquí el formulario tal como llegó por WhatsApp.\n\n' +
          '1) Correo electrónico:\n2) Nombre y dirección\n3) Antigüedad laboral\n' +
          '4) Nombre y teléfono de algún compañero de su trabajo\n' +
          '5) Tiempo viviendo en su casa actual:\n' +
          '6) Nombre y teléfono de algún amigo, conocido o familiar\n' +
          '7) Número de seguro social (Opcional)'
        }
        onChange={(evento) => onTexto(evento.target.value)}
        onPaste={(evento) => {
          // Se deja pegar normal y se lee con el valor ya actualizado.
          const area = evento.currentTarget;
          setTimeout(() => onLeer(area.value), 0);
        }}
        rows={8}
      />

      {estado === 'error' && (
        <div className="aviso rojo" role="alert">
          {mensaje}
        </div>
      )}

      <div className="formulario-pie">
        <span className="nota-suave">Se lee al pegar. Si lo editas a mano, vuelve a leerlo.</span>
        <button
          type="button"
          className="secundario"
          disabled={!texto.trim() || estado === 'leyendo'}
          onClick={() => onLeer(texto)}
        >
          <IconoReintentar tamano={14} />
          {estado === 'leyendo' ? 'Leyendo…' : estado === 'listo' ? 'Volver a leer' : 'Leer formulario'}
        </button>
      </div>
    </div>
  );
}
