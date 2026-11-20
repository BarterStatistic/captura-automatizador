import { referenciasRequeridas } from '../lib/esquemas.js';
import { horarioLegible, interpretarHorario } from '../lib/horario.js';
import { IconoReintentar } from './Iconos.jsx';

const unir = (...partes) => partes.map((parte) => String(parte ?? '').trim()).filter(Boolean).join(' · ');

/**
 * Lo que se entendió de cada punto, en el orden del formulario de 10 puntos. Sirve
 * para ver de un vistazo si una respuesta cayó en el punto equivocado o no se
 * encontró, antes de bajar a la revisión.
 */
function puntosLeidos(lectura, personales) {
  const extra = Array.isArray(lectura.referencias_extra) ? lectura.referencias_extra : [];
  const encontradas = (lectura.referencia_nombre || lectura.referencia_telefono ? 1 : 0) + extra.length;
  const faltanPersonales = Math.max(0, personales - encontradas);
  const horario = (texto) => {
    const leido = interpretarHorario(texto);
    return leido ? `${texto} → ${horarioLegible(leido)}` : texto;
  };
  const puntos = [
    { numero: '1', nombre: 'Correo', valor: unir(lectura.correo) },
    { numero: '2', nombre: 'Nombre del trabajo', valor: unir(lectura.empleo) },
    { numero: '3', nombre: 'Puesto', valor: unir(lectura.puesto) },
    {
      numero: '4',
      nombre: 'Dirección del trabajo',
      valor: unir(lectura.direccion_empleo, lectura.colonia_empleo),
      detalle: unir(lectura.cp_empleo && `CP ${lectura.cp_empleo}`, lectura.municipio_empleo, lectura.estado_empleo),
    },
    { numero: '5', nombre: 'Horario de visita (trabajo)', valor: unir(horario(lectura.horario_empleo)) },
    { numero: '6', nombre: 'Antigüedad laboral', valor: unir(lectura.antiguedad_laboral) },
    {
      numero: '7',
      nombre: 'Referencia laboral',
      valor: unir(lectura.companero_nombre, lectura.companero_telefono),
    },
    { numero: '8', nombre: 'Tiempo en su casa', valor: unir(lectura.antiguedad_domicilio) },
    { numero: '9', nombre: 'Horario de visita (casa)', valor: unir(horario(lectura.horario_domicilio)) },
    {
      numero: '10',
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
  ];
  // Lo que no es del esqueleto de 10 puntos solo aparece si vino.
  if (lectura.nss) puntos.push({ numero: '+', nombre: 'NSS (formulario anterior)', valor: unir(lectura.nss), opcional: true });
  puntos.push({ numero: '+', nombre: 'Celular del cliente', valor: unir(lectura.celular), opcional: true });
  return puntos;
}

function LoQueSeEntendio({ lectura, personales }) {
  const puntos = puntosLeidos(lectura, personales);
  const obligatorios = puntos.filter((punto) => !punto.opcional);
  const faltan = obligatorios.filter((punto) => !punto.valor).length;
  return (
    <div className="entendido">
      <div className="entendido-cabeza">
        <h3>Así se entendió</h3>
        <span className={faltan ? 'entendido-falta' : 'entendido-ok'}>
          {faltan
            ? `${faltan} punto${faltan === 1 ? '' : 's'} sin respuesta`
            : `Los ${obligatorios.length} puntos tienen respuesta`}
        </span>
      </div>
      <ol className="entendido-lista">
        {puntos.map((punto) => (
          <li
            key={`${punto.numero}-${punto.nombre}`}
            className={punto.valor ? '' : punto.opcional ? 'opcional' : 'vacio-punto'}
          >
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
          '1) Correo electrónico\n2) Nombre de su trabajo\n3) Puesto en su trabajo\n' +
          '4) Dirección de su trabajo\n5) Horario para recibir en visitas\n' +
          '6) Antigüedad laboral\n' +
          '7) Nombre, apellido y teléfono de algún compañero de su trabajo\n' +
          '8) Tiempo viviendo en su casa actual\n' +
          '9) Horario para recibir visita en domicilio\n' +
          '10) Nombre, apellido y teléfono de algún amigo, conocido o familiar'
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
