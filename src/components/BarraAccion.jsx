import { IconoCheck, IconoCopiar, IconoFlecha } from './Iconos.jsx';

// Nombres legibles de lo que `armarExpediente` reporta en `faltantes`.
export const ETIQUETAS_FALTANTE = {
  tipoCredito: 'Tipo de crédito',
  curp: 'CURP',
  nombres: 'Nombre',
  apellidoPaterno: 'Apellido paterno',
  'domicilio.calle': 'Calle del domicilio',
  'domicilio.cp': 'Código postal',
  correo: 'Correo',
  'empleo.nombre': 'Trabajo',
  celular: 'Celular',
};

/** El id del campo en la revisión, o de la sección para el tipo de crédito. */
export function idDeFaltante(clave) {
  return clave === 'tipoCredito' ? 'paso-tipo' : `campo-${clave.replace('.', '-')}`;
}

function irA(clave) {
  const destino = document.getElementById(idDeFaltante(clave));
  if (!destino) return;
  destino.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Al input directo, para escribir sin otro clic.
  const enfocable = destino.matches('input, select, textarea')
    ? destino
    : destino.querySelector('input, select, textarea, button');
  enfocable?.focus({ preventScroll: true });
}

/**
 * Siempre a la vista: qué falta para llenar Dinamo y el botón para hacerlo. Lo
 * que falta es clicable y lleva al campo.
 */
export default function BarraAccion({
  hayLecturas,
  leyendo,
  faltantes,
  hayExtension,
  llenando,
  copiado,
  onLlenar,
  onCopiar,
}) {
  const listo = hayLecturas && !leyendo && faltantes.length === 0;

  let estado;
  if (!hayLecturas) {
    estado = <span className="accion-nota">Carga documentos y el formulario para armar el expediente.</span>;
  } else if (leyendo) {
    estado = <span className="accion-nota">Gemini sigue leyendo…</span>;
  } else if (faltantes.length > 0) {
    estado = (
      <div className="accion-faltan">
        <span className="accion-nota">Falta:</span>
        {faltantes.map((clave) => (
          <button type="button" key={clave} className="chip-falta" onClick={() => irA(clave)}>
            {ETIQUETAS_FALTANTE[clave] ?? clave}
          </button>
        ))}
      </div>
    );
  } else {
    estado = (
      <span className="accion-nota lista">
        <IconoCheck tamano={15} />
        Expediente completo. Revisa y llena.
      </span>
    );
  }

  return (
    <footer className="barra-accion">
      <div className="barra-accion-interior">
        <div className="accion-estado" aria-live="polite">
          {estado}
        </div>
        <div className="accion-botones">
          <button type="button" className="secundario" disabled={!hayLecturas} onClick={onCopiar}>
            <IconoCopiar tamano={15} />
            {copiado ? 'Copiado' : 'Copiar expediente'}
          </button>
          <button
            type="button"
            className="primario"
            disabled={!listo || !hayExtension || llenando}
            title={hayExtension ? undefined : 'Instala la extensión en este navegador para llenar Dinamo.'}
            onClick={onLlenar}
          >
            {llenando ? 'Llenando en Dinamo…' : 'Llenar en Dinamo'}
            {!llenando && <IconoFlecha tamano={15} />}
          </button>
        </div>
      </div>
    </footer>
  );
}
