// Función de Vercel: POST /api/gemini.
//
// Recibe una petición generateContent ya armada por la página y la reenvía a
// Gemini con la clave del entorno. Ver _proxy.js. Sin sesión no reenvía nada
// (_sesion.js): así la URL pública no gasta la cuota de nadie.

import { entornoDesde, reenviarAGemini } from './_proxy.js';
import { RESPUESTA_SIN_SESION, haySesion } from './_sesion.js';

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

  const { estado, texto } = await reenviarAGemini(req.body, entornoDesde(process.env));

  res.status(estado);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(texto);
}
