import { referenciasRequeridas } from '../lib/esquemas.js';
import { IconoReintentar } from './Iconos.jsx';

const unir = (...partes) => partes.map((parte) => String(parte ?? '').trim()).filter(Boolean).join(' · ');

/**
 * Lo que se entendió de cada punto, en el orden del esqueleto. Sirve para ver
 * de un vistazo si una respuesta cayó en el punto equivocado o no se encontró,
 * antes de bajar a la revisión.
 */
function puntosLeidos(lectura, personales) {
  const extra = Array.isArray(lectura.referencias_extra) ? lectura.referencias_extra : [];
  const encontradas = (lectura.referencia_nombre || lectura.referencia_telefono ? 1 : 0) + extra.length;
  const faltanPersonales = Math.max(0, personales - encontradas);
  return [
    { numero: '1', nombre: 'Correo', valor: unir(lectura.correo) },
    {
      numero: '2',
      nombre: 'Trabajo',
      valor: unir(lectura.empleo, lectura.direccion_empleo, lectura.colonia_empleo),
    },
    { numero: '3', nombre: 'Antigüedad laboral', valor: unir(lectura.antiguedad_laboral) },
    {
      numero: '4',
      nombre: 'Referencia laboral',
      valor: unir(lectura.companero_nombre, lectura.companero_telefono),
    },
    { numero: '5', nombre: 'Tiempo en su casa', valor: unir(lectura.antiguedad_domicilio) },
    {
      numero: '6',
      nombre: personales > 1 ? `Referencias personales (${personales})` : 'Referencia personal',
      valor: unir(lectura.referencia_nombre, lectura.referencia_telefono),
      detalle: [
        extra.length
          ? `Además: ${extra.map((persona) => unir(persona.nombre, persona.telefono)).join('; ')}`
          : '',
        faltanPersonales > 0 && encontradas > 0
          ? `Este crédito pide ${personales}: falta${faltanPersonales === 1 ? '' : 'n'} ${faltanPersonales}; agrégala${faltanPersonales === 1 ? '' : 's'} en la revisión.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    { numero: '7', nombre: 'NSS', valor: unir(lectura.nss), opcional: true },
    { numero: '+', nombre: 'Celular del cliente', valor: unir(lectura.celular), opcional: true },
  ];
}

function LoQueSeEntendio({ lectura, personales }) {
  const puntos = puntosLeidos(lectura, personales);
  const faltan = puntos.filter((punto) => !punto.valor && !punto.opcional).length;
  return (
    <div className="entendido">
      <div className="entendido-cabeza">
        <h3>Así se entendió</h3>
        <span className={faltan ? 'entendido-falta' : 'entendido-ok'}>
          {faltan ? `${faltan} punto${faltan === 1 ? '' : 's'} sin respuesta` : 'Los 6 puntos tienen respuesta'}
        </span>
      </div>
      <ol className="entendido-lista">
        {puntos.map((punto) => (
          <li key={punto.nombre} className={punto.valor ? '' : punto.opcional ? 'opcional' : 'vacio-punto'}>
            <span className="entendido-numero">{punto.numero}</span>
            <span className="entendido-nombre">{punto.nombre}</span>
            <span className="entendido-valor">
              {punto.valor || (punto.opcional ? 'No viene' : 'No se encontró: complétalo en la revisión')}
              {punto.detalle && <small>{punto.detalle}</small>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * El formulario que manda el vendedor, pegado tal cual.
 *
 * Al pegar se lee solo; si después se edita el texto a mano, se vuelve a leer
 * con el botón. Lo que se extrae aparece en la revisión, igual que lo de los
 * documentos.
 */
export default function Formulario({ texto, estado, mensaje, lectura, manual, onTexto, onLeer }) {
  const personales = referenciasRequeridas(manual?.esquemaVenta).length;
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

      {estado === 'listo' && lectura && <LoQueSeEntendio lectura={lectura} personales={personales} />}

      <div className="formulario-pie">
        <span className="nota-suave">
          Se lee solo al pegarlo. Acepta el formato de WhatsApp (negritas, emojis de número). Si lo
          editas a mano, vuelve a leerlo.
        </span>
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
