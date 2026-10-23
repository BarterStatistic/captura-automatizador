// Función de Vercel: POST /api/gemini.
//
// Recibe una petición generateContent ya armada por la página y la reenvía a
// Gemini con la clave del entorno. Ver _proxy.js. Sin sesión no reenvía nada
// (_sesion.js): así la URL pública no gasta la cuota de nadie.

import { entornoDesde, reenviarAGemini } from './_proxy.js';
import { registrarGasto } from './_gasto.js';
import { RESPUESTA_SIN_SESION, haySesion, leerSesion, secretoDe, tokenDeCookies } from './_sesion.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: { message: 'Solo se acepta POST.' } });
    return;
  }

  if (!haySesion(req.headers.cookie, process.env)) {
    res.status(401);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(RESPUESTA_SIN_SESION);
    return;
  }

  const entorno = entornoDesde(process.env);
  const respuesta = await reenviarAGemini(req.body, entorno);
  const { estado, texto } = respuesta;

  // Se espera el registro: Vercel congela la función en cuanto responde.
  const usuario = leerSesion(tokenDeCookies(req.headers.cookie), secretoDe(process.env));
  const costo = await registrarGasto(
    respuesta,
    { usuario, captura: req.headers['x-captura'], modelo: entorno.modelo },
    process.env,
  );
  res.setHeader('X-Costo-USD', String(costo));

  res.status(estado);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(texto);
}
