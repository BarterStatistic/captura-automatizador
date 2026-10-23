// Función de Vercel: GET /api/gasto. Balance del mes del gasto en Gemini.
// Pide sesión, igual que /api/gemini.

import { resumenDelMes } from './_gasto.js';
import { RESPUESTA_SIN_SESION, haySesion } from './_sesion.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!haySesion(req.headers.cookie, process.env)) {
    res.status(401);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(RESPUESTA_SIN_SESION);
    return;
  }
  const { estado, cuerpo } = await resumenDelMes(process.env);
  res.status(estado).json(cuerpo);
}
