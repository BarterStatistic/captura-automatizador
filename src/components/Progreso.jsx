import { MarcaPaso } from './Paso.jsx';

const TEXTO_ESTADO = {
  pendiente: 'Pendiente',
  'en-curso': 'Leyendo',
  listo: 'Listo',
  atencion: 'Revisar',
  bloqueado: 'Bloqueado',
};

/**
 * El mapa de la captura: dónde va el capturista y qué le falta. Cada paso es un
 * enlace a su sección. En pantallas angostas se vuelve una tira horizontal.
 */
export default function Progreso({ pasos }) {
  const actual = pasos.find((paso) => paso.estado !== 'listo')?.id;

  return (
    <nav className="progreso" aria-label="Pasos de la captura">
      <ol>
        {pasos.map((paso) => (
          <li key={paso.id} className={`${paso.estado}${paso.id === actual ? ' actual' : ''}`}>
            <a href={`#${paso.id}`} aria-current={paso.id === actual ? 'step' : undefined}>
              <MarcaPaso numero={paso.numero} estado={paso.estado} />
              <span className="progreso-texto">
                <span className="progreso-nombre">{paso.titulo}</span>
                <span className="progreso-detalle">
                  {paso.resumenCorto ?? TEXTO_ESTADO[paso.estado]}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
