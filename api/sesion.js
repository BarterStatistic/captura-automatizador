// Función de Vercel: GET /api/sesion. Dice si hay sesión abierta y de quién.

import { atenderSesion } from './_sesion.js';

export default function handler(req, res) {
  const { estado, cuerpo } = atenderSesion(req.headers.cookie, process.env);
  res.setHeader('Cache-Control', 'no-store');
  res.status(estado).json(cuerpo);
}
