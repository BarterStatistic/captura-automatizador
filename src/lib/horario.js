// Horarios de visita escritos a mano → horas enteras de Dinamo.
//
// Los campos `cbohora_de` / `cbohora_a` (y los de empleo) son menús con las
// horas 0 a 23. El cliente escribe «6am a 6pm», «7pm 10pm», «de 9 a 5», «8:00 -
// 17:00» o «por las tardes». Aquí se lleva eso a { de, a } sin inventar horas:
// si no se entiende, se devuelve null y quien llama usa el horario de siempre.

const HORA = /(?<![\d:.])(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?(?![\d])/gi;

// Sin cifras: «por la tarde», «en las noches». Son aproximaciones y se avisa.
const POR_PALABRA = [
  { patron: /todo\s+el\s+d[ií]a|cualquier\s+hora|a\s+cualquier|24\s*(?:hrs?|horas)|todo\s+el\s+tiempo/i, de: 8, a: 20, dice: 'a cualquier hora' },
  { patron: /ma[ñn]anas?|por\s+la\s+ma[ñn]ana/i, de: 8, a: 12, dice: 'en la mañana' },
  { patron: /tardes?|por\s+la\s+tarde/i, de: 14, a: 19, dice: 'en la tarde' },
  { patron: /noches?|por\s+la\s+noche/i, de: 19, a: 22, dice: 'en la noche' },
];

const DICE_NOCHE = /(?:de\s+la\s+|en\s+la\s+|por\s+la\s+)?(?:tarde|noche)s?/i;

function a24(hora, meridiem) {
  const m = String(meridiem ?? '').toLowerCase().replace(/[\s.]/g, '');
  if (m === 'am') return hora === 12 ? 0 : hora;
  if (m === 'pm') return hora < 12 ? hora + 12 : hora;
  return hora;
}

/**
 * Interpreta un horario. Devuelve `{ de, a, avisos }` o null si no hay horario
 * que se pueda leer. `de` y `a` son horas enteras de 0 a 23 con `de < a`.
 *
 * Reglas, en este orden:
 *   - Con am/pm se respeta («6am a 6pm» → 6 y 18).
 *   - Sin am/pm y con «tarde» o «noche» en el texto, las horas de 1 a 11 son p. m.
 *   - Sin am/pm y la segunda hora menor o igual que la primera («de 9 a 5»), la
 *     segunda es de la tarde (17).
 *   - Los minutos se ignoran: el menú solo tiene horas enteras.
 *   - Sin horas, «por la tarde» y similares se traducen a un rango fijo y se avisa.
 */
export function interpretarHorario(texto) {
  const original = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (!original) return null;

  const avisos = [];
  const marcas = [...original.matchAll(HORA)]
    .map((coincidencia) => ({
      hora: Number(coincidencia[1]),
      minutos: coincidencia[2] ? Number(coincidencia[2]) : 0,
      meridiem: coincidencia[3] ?? '',
    }))
    .filter((marca) => marca.hora >= 0 && marca.hora <= 24 && marca.minutos < 60);

  if (marcas.length >= 2) {
    const [primera, segunda] = marcas;
    const porLaTarde = DICE_NOCHE.test(original);

    let de = primera.hora === 24 ? 0 : primera.hora;
    let a = segunda.hora === 24 ? 23 : segunda.hora;

    if (primera.meridiem || segunda.meridiem) {
      de = a24(de, primera.meridiem);
      a = a24(a, segunda.meridiem);
      // «6am a 6»: la segunda sin am/pm que no pasa de la primera es de la tarde.
      if (!segunda.meridiem && a <= de && a >= 1 && a <= 11) a += 12;
    } else if (porLaTarde) {
      if (de >= 1 && de <= 11) de += 12;
      if (a >= 1 && a <= 11) a += 12;
    } else if (a <= de && a >= 1 && a <= 11) {
      a += 12;
      avisos.push(`«${original}» no trae am/pm: se leyó de ${de} a ${a} horas.`);
    } else if (de <= 11 && a <= 12) {
      avisos.push(`«${original}» no trae am/pm: se capturó de ${de} a ${a} horas (de madrugada a mediodía). Revísalo.`);
    }

    if (de > 23 || a > 23) return null;
    if (a <= de) {
      // «10pm a 2am»: cruza la medianoche y el menú no tiene ese rango.
      if (de < 23) {
        avisos.push(`«${original}» cruza la medianoche: se capturó de ${de} a 23 horas.`);
        a = 23;
      } else {
        return null;
      }
    }
    if (primera.minutos || segunda.minutos) {
      avisos.push(`«${original}» trae minutos y Dinamo solo acepta horas enteras: se redondeó hacia abajo.`);
    }
    return { de, a, avisos };
  }

  if (marcas.length === 1) return null; // una sola hora no es un horario

  for (const { patron, de, a, dice } of POR_PALABRA) {
    if (patron.test(original)) {
      return { de, a, avisos: [`«${original}» no trae horas: se capturó de ${de} a ${a} horas (${dice}).`] };
    }
  }
  return null;
}

/** «de 6 a 18 h», para mostrar en la revisión. */
export function horarioLegible(horario) {
  return horario ? `de ${horario.de} a ${horario.a} h` : '';
}
